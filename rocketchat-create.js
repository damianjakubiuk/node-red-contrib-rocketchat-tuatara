const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatCreate(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		node.on('input', async function (msg) {
			const { host, user, token, department, queueDepartment } = node.server;
			const {
				roomType,
				roomName,
				roomNameType,
				users,
				usersType,
				readOnly,
				liveChatTokenConfig,
				liveChatTokenConfigType,
				liveChatEmailConfig,
				liveChatEmailConfigType,
				liveChatNameConfig,
				liveChatNameConfigType,
			} = config;

			const apiInstance = api({ host, user, token });

			const name = RED.util.evaluateNodeProperty(roomName, roomNameType, this, msg);
			const configUsers = RED.util.evaluateNodeProperty(users, usersType, this, msg);
			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);
			const liveChatEmail = RED.util.evaluateNodeProperty(
				liveChatEmailConfig,
				liveChatEmailConfigType,
				this,
				msg
			);
			const liveChatName = RED.util.evaluateNodeProperty(liveChatNameConfig, liveChatNameConfigType, this, msg);

			const members = Array.isArray(configUsers) ? configUsers : [configUsers];

			const processResponse = (success, payload, errors) => {
				if (success) {
					node.send({
						...msg,
						payload,
					});
					node.status({});
				} else {
					node.error(errors);
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('rocketchat-create.errors.error-processing', errors),
					});
				}
			};

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-create.label.sending' });
			try {
				switch (roomType) {
					case 'channel': {
						const { success, channel, errors } = await apiInstance.createChannel({
							name,
							members,
							readOnly,
						});
						processResponse(success, channel, errors);
						break;
					}
					case 'group': {
						const { success, group, errors } = await apiInstance.createGroup({ name, members, readOnly });
						processResponse(success, group, errors);
						break;
					}
					case 'live': {
						if (msg.payload.escalate) {
							await apiInstance.createLiveChatVisitor({
								name: liveChatName,
								email: liveChatEmail,
								token: liveChatToken,
							});
							await apiInstance.transferVisitorRooms({
								token: liveChatToken,
								department: msg.payload.department || department,
							});
							processResponse(true, msg.payload);
						} else {
							const { success, config } = await apiInstance.getLiveChatConfig({
								token: liveChatToken,
							});
							const getLiveChatRoomsResponse = await apiInstance.getLiveChatRooms({
								visitorToken: liveChatToken,
							});
							let room;
							let newRoom = false;
							let setCustomField;
							if (getLiveChatRoomsResponse.rooms.length >= 1) {
								room = getLiveChatRoomsResponse.rooms[0];
								await apiInstance.closeVisitorLiveChatRooms({
									token: liveChatToken,
									except: [room._id],
								});
								if (!msg.payload.whatsapp) {
									await apiInstance.transferRoom({
										rid: room._id,
										department: msg.payload.queueDepartment || queueDepartment,
									});
								}
							} else {
								await apiInstance.createLiveChatVisitor({
									name: liveChatName,
									email: liveChatEmail,
									token: liveChatToken,
									department: msg.payload.queueDepartment || queueDepartment,
								});
								let createLiveChatRoomResponse = await apiInstance.createLiveChatRoom({
									token: liveChatToken,
									rid: name,
								});
								room = createLiveChatRoomResponse.room;
								newRoom = true;
								setCustomField = await apiInstance.setCustomField({
									token: liveChatToken,
									key: 'token',
									value: liveChatToken,
									overwrite: true,
								});
							}
							const { officeHours } = await apiInstance.getOfficeHours();
							config.room = room;
							config.room_id = room._id;
							config.newRoom = newRoom;
							config.officeHours = officeHours;
							config.setCustomField = setCustomField;
							config.payload = msg.payload;
							processResponse(success, config);
						}
						break;
					}

					default:
						throw new Error('Invalid roomType');
				}
			} catch (error) {
				node.error(error);
				node.error(error.name);
				node.error(error.message);
				node.status({
					fill: 'red',
					shape: 'ring',
					text: RED._('rocketchat-create.errors.error-processing', error),
				});
			}
		});
	}

	RED.nodes.registerType('rocketchat-create', RocketChatCreate);
};
