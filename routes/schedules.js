'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const { v4: uuidv4 } = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');
const Comment = require('../models/comment');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, async (req, res, next) => {
  const scheduleId = uuidv4();
  const updateAt = new Date();
  await Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255) || '（名称未設定）',
    memo: req.body.memo,
    createBy: req.user.id,
    updateAt: updateAt
  });
  createCandidatesAndRedirect(parseCandidateNames(req), scheduleId, res);
});

router.get('/:scheduleId', authenticationEnsurer, async (req, res, next) => {
  const schedule = await Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['updateAt', 'DESC']]
  });
  if (schedule) {
    const candidates = await Candidate.findAll({
      where: { scheduleId: schedule.scheduleId },
      order: [['candidateId', 'ASC']]
    });
    // データベースからその予定の全ての出欠を取得する
    const availabilities = await Availability.findAll({
      include: [
        {
          model: User,
          attributes: ['userId', 'username']
        }
      ],
      where: { scheduleId: schedule.scheduleId },
      order: [[User, 'username', 'ASC'], ['candidateId', 'ASC']]
    });
    // 出欠 MapMap(キー:ユーザ ID, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
    const availabilityMapMap = new Map(); // key: userId, value: Map(key: candidateId, value: availability)
    availabilities.forEach(a => {
      const map = availabilityMapMap.get(a.user.userId) || new Map();
      map.set(a.candidateId, a.availability);
      availabilityMapMap.set(a.user.userId, map);
    });

    // 閲覧ユーザと出欠に紐づくユーザからユーザ Map (キー:ユーザ ID, 値:ユーザ) を作る
    const userMap = new Map(); // key: userId, value: User
    userMap.set(parseInt(req.user.id), {
      isSelf: true,
      userId: parseInt(req.user.id),
      username: req.user.username
    });
    availabilities.forEach((a) => {
      userMap.set(a.user.userId, {
        isSelf: parseInt(req.user.id) === a.user.userId,
        userId: a.user.userId,
        username: a.user.username
      });
    });

    // 全ユーザ，全候補で二重ループしてそれぞれの出欠の値がない場合には，「欠席」を設定する
    const users = Array.from(userMap).map(keyValue => keyValue[1]);
    users.forEach((u) => {
      candidates.forEach((c) => {
        const map = availabilityMapMap.get(u.userId) || new Map();
        const a = map.get(c.candidateId) || 0;
        map.set(c.candidateId, a);
        availabilityMapMap.set(u.userId, map);
      });
    });

    // コメント取得
    const comments = await Comment.findAll({
      where: { scheduleId: schedule.scheduleId }
    });
    const commentMap = new Map(); // key: userId, value: comment
    comments.forEach((comment) => {
      commentMap.set(comment.userId, comment.comment);
    });

    res.render('schedule', {
      user: req.user,
      schedule: schedule,
      candidates: candidates,
      users: users,
      availabilityMapMap: availabilityMapMap,
      commentMap: commentMap
    });
  } else {
    const err = new Error('指定された予定は見つかりません');
    err.status = 404;
    next(err);
  }
});

router.get('/:scheduleId/edit', authenticationEnsurer, async (req, res, next) => {
  const schedule = await Schedule.findOne({
    where: { scheduleId: req.params.scheduleId }
  });
  if (isMine(req, schedule)) { // 作成者のみが編集フォームを開ける
    const candidates = await Candidate.findAll({
      where: { scheduleId: schedule.scheduleId },
      order: [['candidateId', 'ASC']]
    });
    res.render('edit', {
      user: req.user,
      schedule: schedule,
      candidates: candidates
    });
  } else {
    const err = new Error('指定された予定がない，または，予定する権限がありません');
    err.status = 404;
    next(err);
  }
});

function isMine(req, schedule) {
  return schedule && parseInt(schedule.createBy) === parseInt(req.user.id);
}

router.post('/:scheduleId', authenticationEnsurer, async (req, res, next) => {
  let schedule = await Schedule.findOne({
    where: { scheduleId: req.params.scheduleId }
  });
  if (schedule && isMine(req, schedule)) {
    if (parseInt(req.query.edit) === 1) {
      const updateAt = new Date();
      schedule = await schedule.update({
        scheduleId: schedule.scheduleId,
        scheduleName: req.body.scheduleName.slice(0, 255) || '（名称未設定）',
        memo: req.body.memo,
        createBy: req.user.id,
        updateAt: updateAt
      });
      // 追加されているかチェック
      const candidateNames = parseCandidateNames(req);
      if (candidateNames) {
        createCandidatesAndRedirect(candidateNames, schedule.scheduleId, res);
      } else {
        res.redirect('/schedules/' + schedule.scheduleId);
      }
    } else if (parseInt(req.query.delete) === 1) {
      await deleteScheduleAggregate(req.params.scheduleId);
      res.redirect('/');
    } else {
      const err = new Error('不正なリクエストです');
      err.status = 400;
      next(err);
    }
  } else {
    const err = new Error('指定された予定がない，または，編集する権限がありません');
    err.status = 404;
    next(err);
  }
});

async function deleteScheduleAggregate(scheduleId) {
  // コメントの削除
  const comments = await Comment.findAll({
    where: { scheduleId:scheduleId }
  });
  const promiseCommentDestroy = comments.map((c) => { return c.destroy(); });
  await Promise.all(promiseCommentDestroy);

  // 出欠の削除
  const availabilities = await Availability.findAll({
    where: { scheduleId: scheduleId }
  });
  const promiseAvailabilityDestroy = availabilities.map((a) => { return a.destroy(); });
  await Promise.all(promiseAvailabilityDestroy);

  // 候補の削除
  const candidates = await Candidate.findAll({
    where: { scheduleId: scheduleId }
  });
  const promisesCandidateDestroy = candidates.map((c) => { return c.destroy(); });
  await Promise.all(promisesCandidateDestroy);

  // スケジュールの削除
  const s = await Schedule.findByPk(scheduleId);
  await s.destroy();
}

router.deleteScheduleAggregate = deleteScheduleAggregate;

async function createCandidatesAndRedirect(candidateNames, scheduleId, res) {
  const candidates = candidateNames.map((c) => {
    return {
      candidateName: c,
      scheduleId: scheduleId
    };
  });
  await Candidate.bulkCreate(candidates);
  res.redirect('/schedules/' + scheduleId);
}

function parseCandidateNames(req) {
  return req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
}

module.exports = router;