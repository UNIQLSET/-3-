import { scheduleData } from './schedule-data.js';

export const scheduleDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const scheduleStart = '2026-08-31';
export const scheduleMaxWeek = 17;

export function findScheduleRow(group, day, week) {
  return scheduleData.find(row => row[0] === group && row[1] === day && row[2] === week);
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${value}T`);
}

function plainText(value) {
  return String(value).replace(/<[^>]*>|&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** @returns {{number: number, time: string, subject: string}[]} */
export function scheduledPairs(group, date) {
  const elapsed = (Date.parse(date) - Date.parse(scheduleStart)) / 86400000;
  const week = Math.floor(elapsed / 7);
  if (week < 0 || week > scheduleMaxWeek) return [];

  const day = scheduleDays[elapsed % 7];
  if (!day) return [];
  const row = findScheduleRow(group, day, week);
  return (row?.[3] || []).map(([, number, time, subject]) => ({
    number: Number.parseInt(number, 10), time: plainText(time), subject: plainText(subject)
  }));
}
