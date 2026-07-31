const express = require('express');
const path = require('path');

const router = express.Router();

function getAppInfo() {
  let version = '1.0.0';
  try { version = require(path.join(__dirname, '../../package.json')).version; } catch {}
  return {
    name: 'MyCalendar',
    version,
    description: 'Calendar & Schedule Manager with Google Calendar sync',
    author: 'SHKWON(knix008@naver.com)',
  };
}

router.get('/', (req, res) => res.json(getAppInfo()));

const handler = (req, res, next) => router(req, res, next);
handler.getAppInfo = getAppInfo;
module.exports = handler;
