const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatClose(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		const { liveChatTokenConfig, liveChatTokenConfigType, destination } = config;

		node.on('input', async function (msg) {
			const { host, user, token } = node.server;

			const apiInstance = api({ host, user, token });

			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-close.label.sending' });
			try {
				switch (destination) {
					case 'live': {
						await apiInstance.closeVisitorLiveChatRooms({ token: liveChatToken });
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
			}
		});
	}

	RED.nodes.registerType('rocketchat-close', RocketChatClose);
};
