/**
 * RoomController
 *
 * @description :: Server-side logic for managing rooms
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var moment = require('moment');
var actionUtil = require('../../node_modules/sails/lib/hooks/blueprints/actionUtil');
var ObjectId = require('mongodb').ObjectID;
var Promise = require('bluebird');

var ForbiddenError = require('../errors/ForbiddenError');
var InvalidInputError = require('../errors/InvalidInputError');

// POST /room/:id/message
// Create a new message
module.exports.message = function (req, res) {

	var userId = req.session.userId;
	var roomId = actionUtil.requirePk(req);

	RoomMember.findOne({user: userId, room: roomId}).populate('user').then(function (roomMember) {

		if (!roomMember) throw new ForbiddenError('Must be a member of this room');

		if (roomMember.user.busy) {
			// User is flagged as busy, we can now remove this flag since they are interacting with the app
			User.update(roomMember.user.id, {busy: false}).exec(function (err, users) {
			});
		}

		// Inform clients that use is not busy and typing has ceased
		User.publishUpdate(userId, {busy: false, typingIn: null});

		return messageService.createMessage(roomMember, req.param('text'));
	})
		.then(res.ok)
		.catch(ForbiddenError, function (err) {
			res.forbidden(err);
		})
		.catch(InvalidInputError, function (err) {
			res.badRequest(err);
		})
		.catch(res.serverError);
};

// GET /room/:id
module.exports.findOne = function (req, res) {
	var pk = actionUtil.requirePk(req);
	Promise.join(
		Room.findOne(pk),
		Message.find({room: pk}).limit(40).populate('author'),
		RoomMember.find({room: pk}).populate('user')
	)
		.spread(function (room, messages, members) {
			room.$messages = messages;
			room.$members = members;
			return room;
		})
		.then(res.ok)
		.catch(res.serverError);
};

// POST /room
// Create a room
module.exports.create = function (req, res) {
	var userId = req.session.userId;
	var name = req.param('name') || 'Untitled';

	// Create new instance of model using data from params
	Room.create({name: name}).exec(function (err, room) {

		// Make user an administrator
		RoomMember.create({room: room.id, user: userId, role: 'administrator'}).exec(function (error, roomMember) {
			RoomMember.publishCreate(roomMember);

			// WARNING
			// Do not publishCreate of this room, it will go to all users who's client will then join it

			res.status(201);
			res.ok(room.toJSON());
		});
	});
};

// GET /room/:id/join
// Join a room
module.exports.join = function (req, res) {
	var pk = actionUtil.requirePk(req);
	var userId = req.session.userId;

	Promise.join(
		Room.findOne(pk),
		RoomMember.count({room: pk, user: userId})
	)
		.spread(function (room, existingRoomMember) {

			if (!room) {
				return new InvalidInputError('Requested room does not exist');
			}

			if (existingRoomMember > 0) {
				// Already exists!
				return RoomMember.findOne({room: pk, user: userId}).populate('user');
			}

			return RoomMember.create({room: pk, user: userId})
				.then(function (createdRoomMember) {
					return [
						createdRoomMember,
						User.findOne(userId),
						Room.findOne(pk),
						RoomMember.find({room: pk}).populate('user')
					];
				})
				.spread(function (createdRoomMember, user, room, roomMembers) {
					Room.publishUpdate(pk, {$members: roomMembers});

					// Create system message to inform other users of this user joining
					RoomService.messageRoom(pk, user.nick + ' has joined the room');

					// Add subscriptions for requestor
					Room.subscribe(req, pk, ['update', 'destroy', 'message']);
					RoomMember.subscribe(req, roomMembers, ['update', 'destroy']);
					User.subscribe(req, _.pluck(roomMembers, 'user'), 'update');

					// Add subscriptions for existing room members
					_.each(Room.subscribers(pk, 'update'), function (subscriber) {
						RoomMember.subscribe(subscriber, createdRoomMember, ['update', 'destroy']);
						User.subscribe(subscriber, userId, 'update');
					});

					return room;
				});
		})
		.then(res.ok)
		.catch(InvalidInputError, function (err) {
			res.badRequest(err);
		})
		.catch(res.serverError);
};

// PUT /room/:id/leave
// Current user requesting to leave a room
module.exports.leave = function (req, res) {

	var pk = actionUtil.requirePk(req);
	var userId = req.session.userId;

	RoomMember.count({room: pk, user: userId})
		.then(function (existingRoomMember) {

			if (existingRoomMember == 0) {
				return 'ok';
			}

			return RoomMember.destroy({room: pk, user: userId})
				.then(function () {
					return [
						User.findOne(userId),
						RoomMember.find({room: pk}).populate('user')
					];
				})
				.spread(function (user, roomMembers) {
					Room.publishUpdate(pk, {$members: roomMembers});

					RoomService.messageRoom(pk, user.nick + ' has left the room');

					Room.unsubscribe(req, pk, ['update', 'destroy', 'message']);
					// TODO unsubscribe all members? probably not... need to figure out which ones
				});
		})
		.then(res.ok)
		.catch(res.serverError);
};

// GET /room/:id/messages
// Get the messages of a room, with optional skip amount
module.exports.messages = function (req, res) {
	var roomId = actionUtil.requirePk(req);
	var skip = req.param('skip') || 0;
	// TODO check for roomId and user values

	// find finds multiple instances of a model, using the where criteria (in this case the roomId
	// we also want to sort in DESCing (latest) order and limit to 50
	// populateAll hydrates all of the associations
	Message.find({room: roomId}).sort('createdAt DESC').skip(skip).limit(40).populateAll()
		.then(res.ok)
		.catch(res.serverError);
};

// GET /room/:id/history
// Get historical messages of a room
module.exports.history = function (req, res) {
	var roomId = actionUtil.requirePk(req);
	var startDate = req.param('startDate');
	var endDate = req.param('endDate');

	Message.find({room: roomId, createdAt: {'>': new Date(startDate), '<': new Date(endDate)}})
		.sort('createdAt ASC')
		.populate('author')
		.then(res.ok)
		.catch(res.serverError);
};

// GET /room/:id/media
// Get media messages posted in this room
module.exports.media = function (req, res) {
	var roomId = actionUtil.requirePk(req);
	var mediaRegex = /https?:\/\//gi;

	// Native mongo query so we can use a regex
	Message.native(function (err, messageCollection) {
		if (err) res.serverError(err);

		messageCollection.find({
			room: ObjectId(roomId),
			text: {$regex: mediaRegex}
		}).sort({createdAt: -1}).toArray(function (err, messages) {
			if (err) res.serverError(err);

			res.ok(_.map(messages, function (message) {
				return _(message)
					.pick(['author', 'text', 'createdAt'])
					.extend({id: message._id})
					.value();
			}));
		});
	});
};
