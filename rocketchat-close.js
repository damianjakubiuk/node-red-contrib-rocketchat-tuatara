const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatClose(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		const {
			liveChatTokenConfig,
			liveChatTokenConfigType,
			liveTimeConfigConfig,
			liveTimeConfigConfigType,
			destination,
		} = config;

		node.on('input', async function (msg) {
			const { host, user, token } = node.server;

			const apiInstance = api({ host, user, token });

			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);

			const liveTime = RED.util.evaluateNodeProperty(liveTimeConfigConfig, liveTimeConfigConfigType, this, msg);

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-close.label.sending' });
			try {
				switch (destination) {
					case 'live': {
						if (liveChatToken) {
							const closeVisitorLiveChatRooms = await apiInstance.closeVisitorLiveChatRooms({
								token: liveChatToken,
							});
							node.send({
								...msg,
								closeVisitorLiveChatRooms,
							});
						} else {
							throw new Error('liveChatToken has to be set.');
						}
						break;
					}
					case 'live-all': {
						const getRoomsResponse = await apiInstance.getLiveChatRooms();
						const promisesArray = [];
						const liveTimeInMiliseconds = liveTime * 1000;
						const now = new Date().getTime();
						for (const room of getRoomsResponse.rooms) {
							const lastMessgae = Date.parse(room.lm);
							const lastMessgaePlusFiveMinutes = lastMessgae + liveTimeInMiliseconds;
							const isBefore = lastMessgaePlusFiveMinutes < now;
							if (isBefore) {
								promisesArray.push(
									apiInstance.closeLiveChatRoom({
										token: room.v.token,
										rid: room._id,
									})
								);
							}
						}
						const closeRoomsResponse = await Promise.all(promisesArray);
						node.send({
							getRoomsResponse,
							liveTime,
							liveTimeInMiliseconds,
							closeRoomsResponse,
						});
						break;
					}
					default:
						throw new Error('Invalid destination');
				}
				node.status({});
			} catch (error) {
				node.error(destination + error);
				node.status({
					fill: 'red',
					shape: 'ring',
					text: RED._('rocketchat-close.errors.error-processing', error),
				});
				node.send({
					...msg,
					error,
				});
			}
		});
	}

	RED.nodes.registerType('rocketchat-close', RocketChatClose);
};
