const api = require('./rocketchat');

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

			if (roomId == null) {
				node.warn(RED._('rocketchat-out.errors.invalid-data'));
				node.status({ fill: 'red', shape: 'ring', text: 'rocketchat-out.errors.invalid-data' });
				return;
			}

			if (config.destination === 'users') {
				node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-out.label.sending' });
				try {
					const { success, room, errors } = await apiInstance.createIM({ username: roomId });
					if (success) {
						const { _id } = room;
						roomId = _id;
					} else {
						node.error(RED._('rocketchat-out.errors.error-processing', errors));
						node.status({
							fill: 'red',
							shape: 'ring',
							text: RED._('rocketchat-out.errors.error-processing', errors),
						});
					}
				} catch (error) {
					node.error(RED._('rocketchat-out.errors.error-processing', error));
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('rocketchat-out.errors.error-processing', error),
					});
				}
			}

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-out.label.sending' });
			try {
				await apiInstance.send({
					roomId,
					text,
					attachments,
					alias,
					avatar,
					emoji,
				});
			} catch (error) {
				node.error(RED._('rocketchat-out.errors.error-processing', error));
				node.status({
					fill: 'red',
					shape: 'ring',
					text: RED._('rocketchat-out.errors.error-processing', error),
				});
			}
			node.status({});
		});
	}

	RED.nodes.registerType('rocketchat-out', RocketChatOut);
};
