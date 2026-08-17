import { describe, it, expect } from 'vitest';
import {
  checkInMessage,
  checkOutMessage,
  eodSummaryMessage,
  taskAssignedDm,
  markedAbsentDm,
  checkedOutInactiveDm,
  taskForTodayDm,
  checkInDm,
  checkOutDm,
  statusChangeDm,
  deadlineDm,
} from '../../lib/slack.js';

describe('Slack bot message builders', () => {
  it('flags a late check-in in both the text and the block', () => {
    const onTime = checkInMessage({ name: 'Deepak' }, false);
    expect(onTime.text).not.toMatch(/late/);

    const late = checkInMessage({ name: 'Deepak' }, true);
    expect(late.text).toMatch(/late/);
    expect(late.blocks[0].text.text).toMatch(/late/);
  });

  it('includes the plan of the day in the channel check-in post, when given one', () => {
    const withPlan = checkInMessage({ name: 'Deepak' }, false, ['Ship the report', 'Review PRs']);
    expect(withPlan.blocks[1].elements[0].text).toContain('Plan for today');
    expect(withPlan.blocks[1].elements[0].text).toContain('• Ship the report');
    expect(withPlan.blocks[1].elements[0].text).toContain('• Review PRs');

    const withoutPlan = checkInMessage({ name: 'Deepak' }, false);
    expect(withoutPlan.blocks).toHaveLength(1);
  });

  it('reports the hours worked on check-out, plus what got done', () => {
    const msg = checkOutMessage({ name: 'Chhavi' }, 150, ['Ship the report'], 'Also fixed the deploy.');
    expect(msg.blocks[0].text.text).toContain('2.5h');
    expect(msg.blocks[1].elements[0].text).toContain('• Ship the report');
    expect(msg.blocks[2].elements[0].text).toContain('Also fixed the deploy.');
  });

  it('lists present, absent and not-picked-up tasks in the EOD summary', () => {
    const msg = eodSummaryMessage({
      date: '2026-08-16',
      present: ['Ayush', 'Chhavi'],
      absent: ['Deepak'],
      notPickedUp: ['Ship the report — Ayush'],
    });
    const text = msg.blocks[0].text.text;
    expect(text).toContain('Present (2): Ayush, Chhavi');
    expect(text).toContain('Absent (1): Deepak');
    expect(text).toContain('Ship the report — Ayush');
  });

  it('reads "every task was picked up" when nothing is left over', () => {
    const msg = eodSummaryMessage({ date: '2026-08-16', present: [], absent: [], notPickedUp: [] });
    expect(msg.blocks[0].text.text).toContain('Every planned task was picked up today.');
  });

  it('names the creator and the deadline in a task-assigned DM', () => {
    const dm = taskAssignedDm({ title: 'Ship the report', dueDate: new Date('2026-08-20T00:00:00.000Z') }, { name: 'Ayush' });
    expect(dm.text).toContain('Ayush assigned you');
    expect(dm.blocks[0].text.text).toContain('Ship the report');
    expect(dm.blocks[0].text.text).toContain('2026-08-20');
  });

  it('names the date in a marked-absent DM', () => {
    const dm = markedAbsentDm('2026-08-16');
    expect(dm.text).toContain('2026-08-16');
    expect(dm.blocks[0].text.text).toContain('marked absent for 2026-08-16');
  });

  it('reports the idle cut-off and hours worked in a checked-out-for-inactivity DM', () => {
    const dm = checkedOutInactiveDm(125, 30);
    expect(dm.blocks[0].text.text).toContain('30 minutes');
    expect(dm.blocks[0].text.text).toContain('2.1h');
  });

  it('lists today\'s plan points, or says the plan is empty', () => {
    const withPoints = taskForTodayDm([{ title: 'Ship the report' }, { title: 'Review PRs' }]);
    expect(withPoints.blocks[0].text.text).toContain('• Ship the report');
    expect(withPoints.blocks[0].text.text).toContain('• Review PRs');

    const empty = taskForTodayDm([]);
    expect(empty.blocks[0].text.text).toContain('Nothing on it yet');
  });

  it('mirrors a late check-in personally, the same way as the channel version', () => {
    const onTime = checkInDm(false);
    expect(onTime.text).not.toMatch(/late/);
    const late = checkInDm(true);
    expect(late.text).toMatch(/late/);
    expect(late.blocks[0].text.text).toContain('You checked in');
  });

  it('includes the plan of the day in the personal check-in DM, when given one', () => {
    const dm = checkInDm(false, ['Ship the report']);
    expect(dm.blocks[1].elements[0].text).toContain('Your plan for today');
    expect(dm.blocks[1].elements[0].text).toContain('• Ship the report');
  });

  it('reports hours worked, plus what got done, in the personal check-out DM', () => {
    const dm = checkOutDm(150, ['Ship the report'], 'Also fixed the deploy.');
    expect(dm.blocks[0].text.text).toContain('You checked out');
    expect(dm.blocks[0].text.text).toContain('2.5h');
    expect(dm.blocks[1].elements[0].text).toContain('• Ship the report');
    expect(dm.blocks[2].elements[0].text).toContain('Also fixed the deploy.');
  });

  it('frames a status-change DM around "your task", not a named assignee', () => {
    const dm = statusChangeDm({ title: 'Ship the report' }, 'PENDING', 'PROGRESS');
    expect(dm.blocks[0].elements[0].text).toContain('Your task');
    expect(dm.blocks[0].elements[0].text).toContain('Ship the report');
    expect(dm.blocks[0].elements[0].text).toContain('pending → *in progress*');
  });

  it('lists only the given lines in a personal deadline DM', () => {
    const dm = deadlineDm(['Ship the report (due today)', 'Review PRs (late since 2026-08-10)']);
    expect(dm.text).toContain('2 of your tasks');
    expect(dm.blocks[0].text.text).toContain('Your deadlines');
    expect(dm.blocks[0].text.text).toContain('• Ship the report (due today)');
    expect(dm.blocks[0].text.text).toContain('• Review PRs (late since 2026-08-10)');
  });
});
