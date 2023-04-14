'use strict';
const request = require('supertest');
const app = require('../app');
const passportStub = require('passport-stub');
const User = require('../models/user');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const Availability = require('../models/availability');
const Comment = require('../models/comment');

describe('/login', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall();
  });

  test('ログインのためのリンクが含まれる', async () => {
    await request(app)
      .get('/login')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(/<a href="\/auth\/github">/)
      .expect(200);
  });

  test('ログイン時はユーザ名が表示される', async () => {
    await request(app)
      .get('/login')
      .expect(/testuser/)
      .expect(200);
  });
});

describe('/logout', () => {
  test('/ にリダイレクトされる', async () => {
    await request(app)
      .get('/logout')
      .expect('Location', '/')
      .expect(302);
  });
});

describe('/schedules', () => {
  let scheduleId = '';
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();
    await deleteScheduleAggregate(scheduleId);
  });

  test('予定が作成でき，表示される', async () => {
    await User.upsert({ userId: 0, username: 'testuser' });
    const res = await request(app)
      .post('/schedules')
      .send({
        scheduleName: 'テスト予定1',
        memo: 'テストメモ1\r\nテストメモ2',
        candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3'
      })
      .expect('Location', /schedules/)
      .expect(302);

    const createdSchedulePath = res.headers.location;
    scheduleId = createdSchedulePath.split('/schedules/')[1];
    await request(app)
      .get(createdSchedulePath)
      .expect(/テスト予定1/)
      .expect(/テストメモ1/)
      .expect(/テストメモ2/)
      .expect(/テスト候補1/)
      .expect(/テスト候補2/)
      .expect(/テスト候補3/)
      .expect(200);
  });
});

describe('/schedule/:scheduleId/users/:userId/candidates/:candidateId', () => {
  let scheduleId = '';
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();
    await deleteScheduleAggregate(scheduleId);
  });

  test('出欠が更新できる', async () => {
    await User.upsert({ userId: 0, username: 'testuser' });
    const res = await request(app)
      .post('/schedules')
      .send({
        scheduleName: 'テスト出欠更新予定1',
        memo: 'テスト出欠更新メモ1',
        candidates: 'テスト出欠更新候補1'
      });
    const createdSchedulePath = res.headers.location;
    scheduleId = createdSchedulePath.split('/schedules/')[1];
    const candidate = await Candidate.findOne({
      where: { scheduleId: scheduleId }
    });
    // 更新がされることをテスト
    const userId = 0;
    await request(app)
      .post(`/schedules/${scheduleId}/users/${userId}/candidates/${candidate.candidateId}`)
      .send({ availability: 2 }) // 出席に更新
      .expect('{"status":"OK","availability":2}');
    const availabilities = await Availability.findAll({
      where: { scheduleId: scheduleId }
    });
    expect(availabilities.length).toBe(1);
    expect(availabilities[0].availability).toBe(2);
  });
});

describe('/schedule/:scheduleId/users/:userId/comments', () => {
  let scheduleId = '';
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();
    await deleteScheduleAggregate(scheduleId);
  });

  test('コメントが更新できる', async () => {
    await User.upsert({ userId: 0, username: 'testuser' });
    const res = await request(app)
      .post('/schedules')
      .send({
        scheduleName: 'テスト出欠更新予定1',
        memo: 'テスト出欠更新メモ1',
        candidates: 'テスト出欠更新候補1'
      });
    const createdSchedulePath = res.headers.location;
    scheduleId = createdSchedulePath.split('/schedules/')[1];
    // 更新がされることをテスト
    const userId = 0;
    await request(app)
      .post(`/schedules/${scheduleId}/users/${userId}/comments`)
      .send({ comment: 'testcomment' })
      .expect('{"status":"OK","comment":"testcomment"}');
    const comments = await Comment.findAll({
      where: { scheduleId: scheduleId }
    });
    expect(comments.length).toBe(1);
    expect(comments[0].comment).toBe('testcomment');
  });
});

describe('/schedule/:scheduleId?edit=1', () => {
  let scheduleId = '';
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();
    await deleteScheduleAggregate(scheduleId);
  });

  test('予定が更新でき，候補が追加できる', async () => {
    await User.upsert({ userId: 0, username: 'testuser' });
    const res = await request(app)
      .post('/schedules')
      .send({
        scheduleName: 'テスト更新予定1',
        memo: 'テスト更新メモ1',
        candidates: 'テスト更新候補1'
      });
    const createdSchedulePath = res.headers.location;
    scheduleId = createdSchedulePath.split('/schedules/')[1];
    // 更新がされることをテスト
    await request(app)
      .post(`/schedules/${scheduleId}?edit=1`)
      .send({
        scheduleName: 'テスト更新予定2',
        memo: 'テスト更新メモ2',
        candidates: 'テスト更新候補2'
      });
    const s = await Schedule.findByPk(scheduleId);
    expect(s.scheduleName).toBe('テスト更新予定2');
    expect(s.memo).toBe('テスト更新メモ2');
    const candidates = await Candidate.findAll({
      where: { scheduleId: scheduleId },
      order: [['candidateId', 'ASC']]
    });
    expect(candidates.length).toBe(2);
    expect(candidates[0].candidateName).toBe('テスト更新候補1');
    expect(candidates[1].candidateName).toBe('テスト更新候補2');
  });
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