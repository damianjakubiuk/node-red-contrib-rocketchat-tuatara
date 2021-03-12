const api = require('./rocketchat');

function safeStringify(obj, indent = 2) {
	let cache = [];
	const retVal = JSON.stringify(
		obj,
		(key, value) =>
			typeof value === 'object' && value !== null
				? cache.includes(value)
					? undefined // Duplicate reference found, discard key
					: cache.push(value) && value // Store value in our collection
				: value,
		indent
	);
	cache = null;
	return retVal;
}

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
			attachmentsHeaders: configAttachmentsHeaders,
			attachmentsHeadersType,
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
			let attachmentsHeaders = RED.util.evaluateNodeProperty(
				configAttachmentsHeaders,
				attachmentsHeadersType,
				this,
				msg
			);
			if (attachmentsHeaders) {
				try {
					attachmentsHeaders = JSON.parse(attachmentsHeaders);
				} catch (error) {
					attachmentsHeaders = undefined;
				}
			}
			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);
			if (roomId == null) {
				try {
					if (config.destination === 'live' || config.destination === 'chatbot_response') {
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
					case 'chatbot_response': {
						await apiInstance.sendMessage({
							rid: roomId,
							msg: text,
						});
						break;
					}
					case 'live': {
						if (Array.isArray(attachments) && attachments.length >= 1) {
							await apiInstance.sendMessage({
								rid: roomId,
								msg: text,
							});
							for (const attachment of attachments) {
								let uri =
									attachment.video_url ||
									attachment.audio_url ||
									attachment.image_url ||
									attachment.file_url;
								try {
									await apiInstance.downloadAndUploadFile({
										uri,
										rid: roomId,
										msg: attachment.caption || "User didn't set caption for this attachment",
										headers: attachmentsHeaders,
									});
								} catch (error) {
									let errorText;
									if (error.errorType === 'error-invalid-file-type') {
										errorText = 'Upload failed because of invalid file type.';
									} else {
										errorText = 'Upload failed.';
									}
									await apiInstance.sendMessage({
										msg: errorText,
										rid: roomId,
									});
								}
							}
						} else {
							await apiInstance.liveChatSend({
								token: liveChatToken,
								text,
								rid: roomId,
							});
						}
						break;
					}
					default:
						throw new Error('Invalid destination');
				}
				node.status({});
			} catch (error) {
				node.error(RED._('rocketchat-out.errors.error-processing', error));
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
