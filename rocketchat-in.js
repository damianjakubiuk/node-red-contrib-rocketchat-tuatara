const WebSocket = require('ws');
const EJSON = require('ejson');
const url = require('url');
const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatIn(config) {
		RED.nodes.createNode(this, config);
		const node = this;

		const { server, origin, room, roomType, roomData } = config;
		node.server = RED.nodes.getNode(server);

		node.on('input', async function (msg) {
			if (node.server == null) {
				node.status({ fill: 'red', shape: 'ring', text: 'rocketchat-in.errors.invalid-data' });
				return;
			}

			const { host: configHost, user, token } = node.server;

			const { protocol, host } = url.parse(configHost);

			const useSsl = /^https/i.test(protocol);

			const endpoint = `${useSsl ? 'wss://' : 'ws://'}${host}/websocket`;

			let roomId;
			if (origin === 'user') {
				roomId = '__my_messages__';
			} else {
				if (roomType === 'form') {
					const { i } = JSON.parse(roomData);
					roomId = i;
				} else {
					roomId = RED.util.evaluateNodeProperty(room, roomType, this, msg);
				}
			}

			const apiInstance = api({ host: configHost, user, token });

			const processUnreadMessages = async () => {
				try {
					if (origin === 'user') {
						const { success, update = [] } = await apiInstance.getSubscriptions();
						if (success) {
							update.forEach(async ({ rid, ls, unread, t }) => {
								if (t === 'd' && unread > 0) {
									const { success, messages = [] } = await apiInstance.getUnreadMessages({
										roomId: rid,
										oldest: ls,
										type: t,
									});
									if (success) {
										messages.forEach(async (message) => {
											const {
												u: { _id: fromUser },
											} = message;
											if (fromUser !== user) {
												node.send({
													payload: message,
												});
											}
										});
										await apiInstance.markAsRead({ rid });
									}
								}
							});
						}
					} else if (origin === 'room') {
						const {
							success,
							subscription: { ls, t },
						} = await apiInstance.getSubscription({ roomId });
						if (success) {
							const { success, messages = [] } = await apiInstance.getUnreadMessages({
								roomId,
								oldest: ls,
								type: t,
							});
							if (success) {
								messages.forEach(async (message) => {
									const {
										u: { _id: fromUser },
									} = message;
									if (fromUser !== user) {
										node.send({
											payload: message,
										});
									}
								});
								await apiInstance.markAsRead({ rid: roomId });
							}
						}
					}
				} catch (error) {
					node.error(RED._('rocketchat-in.errors.error-processing', error));
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('rocketchat-in.errors.error-processing', error),
					});
				}
			};

			const startListening = () => {
				try {
					processUnreadMessages();

					let ws = new WebSocket(endpoint);

					const wsSend = (message) => {
						ws.send(EJSON.stringify(message));
					};

					const doLogin = () => {
						let loginMessage;
						if (origin === 'live') {
							loginMessage = {
								msg: 'method',
								method: 'livechat:setUpConnection',
								params: [{ token: 'wb7yeib6lumirj0fyte72' }],
								id: 'ddp-1',
							};
						} else {
							loginMessage = {
								msg: 'method',
								method: 'login',
								params: [{ resume: token }],
								id: '1',
							};
						}
						wsSend(loginMessage);
					};

					const subscribeMessages = () => {
						wsSend({
							msg: 'sub',
							id: '2',
							name: 'stream-room-messages',
							params: [roomId, true],
						});
					};

					const heartbeat = () => {
						clearTimeout(ws.pingTimeout);
						ws.pingTimeout = setTimeout(() => {
							node.warn(RED._('rocketchat-in.errors.connection-broken'));
							ws.terminate();
						}, 30000 + 1000);
					};

					ws.on('open', () => {
						heartbeat();
						wsSend({
							msg: 'connect',
							version: '1',
							support: ['1'],
						});
					});

					ws.on('close', () => {
						// try to reconect in 10 seconds
						node.warn(RED._('rocketchat-in.errors.connection-broken'));
						ws.terminate();
						setTimeout(startListening, 10000);
					});

					// Safelly handle ws errors so it doesn't break the application
					// Will forward internal errors to catch
					ws.onerror = () => {};

					ws.on('message', (data) => {
						const parsed = EJSON.parse(data);
						const { id, msg, error, fields } = parsed;
						node.send(parsed);

						switch (msg) {
							case 'connected':
								doLogin();
								break;
							case 'ping':
								wsSend({ msg: 'pong' });
								heartbeat();
								break;
							case 'result':
								if (id === '1') {
									// Login
									if (error != null) {
										node.error(RED._('rocketchat-in.errors.error-processing', error));
										node.status({
											fill: 'red',
											shape: 'ring',
											text: RED._('rocketchat-in.errors.error-processing', error),
										});
									} else {
										subscribeMessages();
									}
								}
								break;
							case 'changed':
								if (fields != null) {
									const { eventName, args } = fields;
									if (eventName === roomId) {
										const [message] = args;
										const {
											rid,
											u: { _id: fromUser },
										} = message;
										if (fromUser !== user) {
											node.send({
												payload: message,
											});
										}
										apiInstance.markAsRead({ rid });
									}
								}
								break;
							default:
								break;
						}
					});
				} catch (error) {
					node.error(RED._('rocketchat-in.errors.error-processing', error));
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('rocketchat-in.errors.error-processing', error),
					});
				}
			};

			startListening();
			node.send(msg);
		});
	}

	RED.nodes.registerType('rocketchat-in', RocketChatIn);
};
