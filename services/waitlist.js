const Event = require('../models/Events');
const Notification = require('../models/Notifications');

// Claim the head and its seat in one write: concurrent workers cannot promote twice.
async function promoteWaitlist(eventId) {
  while (true) {
    const event = await Event.findById(eventId);
    if (!event || new Date(event.startDate) <= new Date() || !event.waitlist?.length || event.participants.length >= event.maxParticipants) return event;
    const first = event.waitlist[0];
    const promoted = await Event.findOneAndUpdate({
      _id: eventId, 'waitlist.0': first, startDate: { $gt: new Date() },
      $expr: { $lt: [{ $size: { $ifNull: ['$participants', []] } }, { $ifNull: ['$maxParticipants', 50] }] },
    }, { $pop: { waitlist: -1 }, $addToSet: { participants: first } }, { new: true });
    if (!promoted) continue;
    try {
      await Notification.create({ recipient: first, event: eventId, type: 'participation', message: `A place opened up: you are now participating in ${promoted.title}.` });
    } catch (error) { console.error('Waitlist promotion notification failed:', error.message); }
  }
}
module.exports = { promoteWaitlist };
