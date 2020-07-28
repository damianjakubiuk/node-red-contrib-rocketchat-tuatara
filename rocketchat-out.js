const api = require('./rocketchat');
const EJSON = require('ejson');

module.exports = function (RED) {
	'use strict';

	function RocketChatOut(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		const {
			messageText,
			messageTextType,
			avatarText,
			avatarTextType,
			aliasText,
			aliasTextType,
			emojiText,
			emojiTextType,
			attachments: configAttachments,
			attachmentsType,
			room,
			roomType,
			roomData,
			liveChatTokenConfig,
			liveChatTokenConfigType,
		} = config;

		node.on('input', async function (msg) {
			const { host, user, token } = node.server;

			const apiInstance = api({ host, user, token });

			let roomId;
			if (roomType === 'form') {
				const { i } = JSON.parse(roomData);
				roomId = i;
			} else {
				roomId = RED.util.evaluateNodeProperty(room, roomType, this, msg);
			}

			const avatar = RED.util.evaluateNodeProperty(avatarText, avatarTextType, this, msg);
			const alias = RED.util.evaluateNodeProperty(aliasText, aliasTextType, this, msg);
			const emoji = RED.util.evaluateNodeProperty(emojiText, emojiTextType, this, msg);
			const text = RED.util.evaluateNodeProperty(messageText, messageTextType, this, msg);
			const attachments = RED.util.evaluateNodeProperty(configAttachments, attachmentsType, this, msg);
			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);
			if (roomId == null) {
				try {
					if (config.destination === 'live') {
						const getLiveChatRoomsResponse = await apiInstance.getLiveChatRooms({
							visitorToken: liveChatToken,
						});
						if (getLiveChatRoomsResponse.rooms.length >= 1) {
							roomId = getLiveChatRoomsResponse.rooms[0]._id;
						} else {
							throw new Error(
								`Invlid getLiveChatRoomsResponse: ${JSON.stringify(getLiveChatRoomsResponse)}`
							);
						}
					} else {
						throw new Error('roomId cannot be null when destination is not live');
					}
				} catch (error) {
					node.warn(RED._('rocketchat-out.errors.invalid-data', error));
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('rocketchat-out.errors.invalid-data', error),
					});
					return;
				}
			}

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-out.label.sending' });
			try {
				switch (config.destination) {
					case 'users': {
						const { success, room, errors } = await apiInstance.createIM({ username: roomId });
						if (success) {
							const { _id } = room;
							roomId = _id;
						} else {
							throw new Error(errors);
						}
						break;
					}
					case 'rooms': {
						await apiInstance.send({
							roomId,
							text,
							attachments,
							alias,
							avatar,
							emoji,
						});
						break;
					}
					case 'live': {
						try {
							await apiInstance.liveChatSend({
								token: liveChatToken,
								text,
								rid: roomId,
							});
						} catch (error) {
							throw new Error(roomId + ':' + token + ':' + EJSON.stringify(error));
						}
						break;
					}
					default:
						throw new Error('Invalid destination');
				}
				node.status({});
			} catch (error) {
				node.error(config.destination + error);
				node.status({
					fill: 'red',
					shape: 'ring',
					text: RED._('rocketchat-out.errors.error-processing', error),
				});
			}
		});
	}

	RED.nodes.registerType('rocketchat-out', RocketChatOut);
};
