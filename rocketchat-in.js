const WebSocket = require('ws');
const EJSON = require('ejson');
const url = require('url');
const api = require('./rocketchat');
const stringifyError = require('./utils/stringifyError');

const HALF_AN_HOUR = 30 * 60000;

module.exports = function (RED) {
	'use strict';

	function RocketChatIn(config) {
		RED.nodes.createNode(this, config);
		const node = this;

		node.server = RED.nodes.getNode(config.server);

		node.on('input', async function (msg) {
			const initialMessage = msg;
			try {
				const {
					origin,
					room,
					roomType,
					roomData,
					liveChatTokenConfig,
					liveChatTokenConfigType,
					liveChatSessionConfig,
					liveChatSessionConfigType,
				} = config;

				if (node.server == null) {
					node.status({ fill: 'red', shape: 'ring', text: 'rocketchat-in.errors.invalid-data' });
					return;
				}

				const { host: configHost, user, token } = node.server;

				const { protocol, host } = url.parse(configHost);

				const useSsl = /^https/i.test(protocol);

				const endpoint = `${useSsl ? 'wss://' : 'ws://'}${host}/websocket`;

				let showConnectionBroken = true;
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
				const liveChatToken = RED.util.evaluateNodeProperty(
					liveChatTokenConfig,
					liveChatTokenConfigType,
					this,
					msg
				);
				const liveChatSession = RED.util.evaluateNodeProperty(
					liveChatSessionConfig,
					liveChatSessionConfigType,
					this,
					msg
				);

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
														...initialMessage,
														initialMessage,
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
												...initialMessage,
												initialMessage,
												payload: message,
											});
										}
									});
									await apiInstance.markAsRead({ rid: roomId });
								}
							}
						}
					} catch (error) {
						node.error(stringifyError(error));
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
									params: [{ token: liveChatToken }],
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
							if (origin === 'live') {
								wsSend({
									msg: 'sub',
									name: 'stream-room-messages',
									params: [
										roomId,
										{
											useCollection: false,
											args: [{ token: liveChatToken, visitorToken: liveChatToken }],
										},
									],
									id: 'ddp-2',
								});
								wsSend({
									msg: 'sub',
									name: 'stream-livechat-room',
									params: [
										roomId,
										{
											useCollection: false,
											args: [{ token: liveChatToken, visitorToken: liveChatToken }],
										},
									],
									id: 'ddp-3',
								});
							} else {
								wsSend({
									msg: 'sub',
									id: '2',
									name: 'stream-room-messages',
									params: [roomId, true],
								});
							}
						};

						const heartbeat = () => {
							clearTimeout(ws.pingTimeout);
							clearInterval(ws.pingInterval);
							ws.pingTimeout = setTimeout(() => {
								if (showConnectionBroken) {
									node.warn(RED._('rocketchat-in.errors.connection-broken'));
								}
								ws.terminate();
							}, 30000 + 1000);
							ws.pingInterval = setInterval(() => {
								wsSend({ msg: 'ping' });
							}, 5000);
						};

						ws.on('open', () => {
							heartbeat();
							let openMessage;
							if (origin === 'live') {
								openMessage = {
									msg: 'connect',
									version: '1',
									support: ['1', 'pre2', 'pre1'],
								};
							} else {
								openMessage = {
									msg: 'connect',
									version: '1',
									support: ['1'],
								};
							}
							wsSend(openMessage);
						});

						ws.on('close', () => {
							// try to reconect in 10 seconds
							clearInterval(ws.pingInterval);
							if (showConnectionBroken) {
								node.warn(RED._('rocketchat-in.errors.connection-broken'));
							}
							ws.terminate();
						});

						// Safelly handle ws errors so it doesn't break the application
						// Will forward internal errors to catch
						ws.onerror = () => {};

						ws.on('message', (data) => {
							const parsed = EJSON.parse(data);
							const { id, msg, error, fields } = parsed;

							try {
								switch (msg) {
									case 'connected':
										doLogin();
										break;
									case 'ping':
										wsSend({ msg: 'pong' });
										heartbeat();
										break;
									case 'pong':
										heartbeat();
										break;
									case 'result':
										if (id === '1' || id === 'ddp-1') {
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
												const { rid, u: { _id: fromUser } = {}, token, t } = message;
												if (origin === 'live') {
													if (token !== liveChatToken) {
														node.send({
															...initialMessage,
															initialMessage,
															roomId: roomId,
															token: liveChatToken,
															payload: message,
															websocket_session_id: liveChatSession,
															_session: {
																type: 'websocket',
																id: liveChatSession,
															},
														});
														apiInstance.markAsRead({ rid });
													}
												} else {
													if (fromUser !== user) {
														node.send({
															...initialMessage,
															initialMessage,
															payload: message,
														});
													}
													apiInstance.markAsRead({ rid });
												}
												if (t === 'livechat-close') {
													setTimeout(() => {
														showConnectionBroken = false;
														clearTimeout(ws.pingTimeout);
														clearInterval(ws.pingInterval);
														ws.terminate();
													}, 10000);
												}
											}
										}
										break;
									default:
										break;
								}
							} catch (error) {
								node.error(stringifyError(error));
								node.status({
									fill: 'red',
									shape: 'ring',
									text: RED._('rocketchat-in.errors.error-processing', error),
								});
							}
						});

						ws.openRoomInterval = setInterval(async () => {
							try {
								const getLiveChatRoomsResponse = await apiInstance.getLiveChatRooms({
									visitorToken: liveChatToken,
								});
								if (getLiveChatRoomsResponse.success) {
									let close = false;
									if (getLiveChatRoomsResponse.rooms.length >= 1) {
										close = !getLiveChatRoomsResponse.rooms.some(({ _id }) => _id === roomId);
									} else {
										close = true;
									}
									if (close) {
										showConnectionBroken = false;
										clearTimeout(ws.pingTimeout);
										clearInterval(ws.pingInterval);
										clearInterval(ws.openRoomInterval);
										ws.terminate();
									}
								}
							} catch (error) {
								node.error(stringifyError(error));
								node.status({
									fill: 'red',
									shape: 'ring',
									text: RED._('rocketchat-in.errors.error-processing', error),
								});
							}
						}, HALF_AN_HOUR);
					} catch (error) {
						node.error(stringifyError(error));
						node.status({
							fill: 'red',
							shape: 'ring',
							text: RED._('rocketchat-in.errors.error-processing', error),
						});
					}
				};

				startListening();
			} catch (error) {
				node.error(stringifyError(error));
			}
		});
	}

	RED.nodes.registerType('rocketchat-in', RocketChatIn);
};
