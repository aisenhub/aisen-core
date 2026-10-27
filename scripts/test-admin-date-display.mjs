#!/usr/bin/env node
// UI-13: one UTC instant must remain the same instant across display time zones.
// No real identities, requests, browser storage or production data are used.
import assert from 'node:assert/strict';
import {formatAdminCalendarDate,formatAdminInstant} from '../apps/admin/src/dateDisplay.ts';

const before=process.env.TZ;
try{
  const utc='2026-03-08T09:30:00.000Z';
  process.env.TZ='UTC';
  const baseline=formatAdminInstant(utc);
  assert.match(baseline,/2026.*03.*08/);
  assert.match(baseline,/09:30/);
  assert.match(baseline,/GMT/);
  process.env.TZ='America/Los_Angeles';
  const beforeDst=formatAdminInstant('2026-03-08T09:30:00Z');
  const afterDst=formatAdminInstant('2026-03-08T10:30:00Z');
  assert.ok(beforeDst.includes('01:30')&&beforeDst.includes('GMT-8'),beforeDst);
  assert.ok(afterDst.includes('03:30')&&afterDst.includes('GMT-7'),afterDst);
  process.env.TZ='Asia/Shanghai';
  const china=formatAdminInstant(utc);
  assert.ok(china.includes('17:30')&&china.includes('GMT+8'),china);
  assert.notEqual(china,baseline,'timezone must be explicit, not misleadingly equal');
  assert.equal(formatAdminInstant(null),'—');
  assert.equal(formatAdminInstant('invalid-time'),'—');
  assert.equal(formatAdminCalendarDate(undefined),'—');
  assert.ok(!formatAdminCalendarDate('2026-03-08T09:30:00Z').includes('GMT'),
    'true calendar date should remain visually distinct from business instants');
  console.log('UI13_DATE_DISPLAY PASS UTC/Shanghai/LA DST and empty/invalid values');
}finally{
  if(before===undefined)delete process.env.TZ;else process.env.TZ=before;
}
