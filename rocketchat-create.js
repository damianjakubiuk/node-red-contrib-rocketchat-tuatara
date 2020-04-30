const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatCreate(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		node.on('input', async function (msg) {
			const { host, user, token } = node.server;
			const livetChatConfig = msg.livetChatConfig;
			const { roomType, roomName, roomNameType, users, usersType, readOnly } = config;

			const apiInstance = api({ host, user, token });

			const name = RED.util.evaluateNodeProperty(roomName, roomNameType, this, msg);
			const configUsers = RED.util.evaluateNodeProperty(users, usersType, this, msg);

			const members = Array.isArray(configUsers) ? configUsers : [configUsers];

			const processResponse = (success, payload, errors) => {
				if (success) {
					node.send({
						...msg,
						payload,
					});
					node.status({});
				} else {
					node.error(RED._('rocketchat-create.errors.error-processing', errors));
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
						await apiInstance.createLiveChatVisitor({
							name: livetChatConfig.name,
							email: livetChatConfig.email,
							token: livetChatConfig.token,
						});
						const { success, config } = await apiInstance.getLiveChatConfig({
							token: livetChatConfig.token,
						});
						const { room } = await apiInstance.createLiveChatRoom({ token: livetChatConfig.token });
						config.room_id = room._id;
						processResponse(success, config);
						break;
					}

					default:
						throw new Error('Invalid roomType');
				}
			} catch (error) {
				node.error(RED._('rocketchat-create.errors.error-processing', error));
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
