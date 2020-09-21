const axios = require('axios');

module.exports = ({ host, user, token }) => ({
	async spotlight(query) {
		const { data } = await axios.get(`${host}/api/v1/spotlight`, {
			params: {
				query,
			},
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': user,
			},
		});
		return data;
	},
	async createIM({ username }) {
		const { data } = await axios.post(
			`${host}/api/v1/im.create`,
			{ username },
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			}
		);
		return data;
	},
	async send({ roomId, text, attachments, alias, avatar, emoji }) {
		const { data } = await axios.post(
			`${host}/api/v1/chat.postMessage`,
			{ roomId, text, alias, emoji, avatar, attachments },
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			}
		);
		return data;
	},
	async getSubscriptions() {
		const { data } = await axios.get(`${host}/api/v1/subscriptions.get`, {
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': user,
			},
		});
		return data;
	},
	async getSubscription({ roomId }) {
		const { data } = await axios.get(`${host}/api/v1/subscriptions.getOne`, {
			params: {
				roomId,
			},
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': user,
			},
		});

		return data;
	},
	async getUnreadMessages({ roomId, oldest, type }) {
		try {
			let endpoint;
			switch (type) {
				case 'g':
					endpoint = 'groups';
					break;
				case 'd':
					endpoint = 'im';
					break;
				default:
					endpoint = 'channels';
					break;
			}

			const { data } = await axios.get(`${host}/api/v1/${endpoint}.history`, {
				params: {
					roomId,
					oldest,
				},
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			});
			return data;
		} catch ({ message }) {
			console.error(message);
			return { success: false, error: { message } };
		}
	},
	async markAsRead({ rid }) {
		const { data } = await axios.post(
			`${host}/api/v1/subscriptions.read`,
			{ rid },
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			}
		);
		return data;
	},
	async createChannel({ name, members, readOnly = false }) {
		const { data } = await axios.post(
			`${host}/api/v1/channels.create`,
			{ name, members, readOnly },
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			}
		);
		return data;
	},
	async createGroup({ name, members, readOnly = false }) {
		const { data } = await axios.post(
			`${host}/api/v1/groups.create`,
			{ name, members, readOnly },
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': user,
				},
			}
		);
		return data;
	},
	async getLiveChatConfig({ token }) {
		const { data } = await axios.get(`${host}/api/v1/livechat/config`, {
			params: {
				token,
			},
		});
		return data;
	},
	async createLiveChatVisitor({ name, email, token }) {
		const { data } = await axios.post(`${host}/api/v1/livechat/visitor`, {
			visitor: { name, email, token },
		});
		return data;
	},
	async createLiveChatRoom({ token, rid }) {
		const { data } = await axios.get(`${host}/api/v1/livechat/room`, {
			params: {
				token,
				rid,
			},
		});
		return data;
	},
	async closeLiveChatRoom({ token, rid }) {
		const { data } = await axios.post(`${host}/api/v1/livechat/room.close`, {
			token,
			rid,
		});
		return data;
	},
	async getLiveChatRooms({ visitorToken }) {
		const { data } = await axios.get(`${host}/api/v1/livechat/rooms`, {
			params: {
				open: true,
				customFields: {
					token: visitorToken,
				},
			},
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': user,
			},
		});
		return data;
	},
	async closeVisitorLiveChatRooms({ token }) {
		const getRoomsResponse = await this.getLiveChatRooms({
			visitorToken: token,
		});
		const promisesArray = [];
		for (const room of getRoomsResponse.rooms) {
			promisesArray.push(
				this.closeLiveChatRoom({
					token: room.v.token,
					rid: room._id,
				})
			);
		}
		const closeRoomsResponse = await Promise.all(promisesArray);
		return {
			getRoomsResponse,
			closeRoomsResponse,
		};
	},
	async setCustomField({ token, key, value, overwrite }) {
		const { data } = await axios.post(`${host}/api/v1/livechat/custom.field`, {
			token,
			key,
			value,
			overwrite,
		});
		return data;
	},
	async transferRoom({ rid, department }) {
		try {
			const { data } = await axios.post(
				`${host}/api/v1/livechat/room.forward`,
				{ roomId: rid, departmentId: department },
				{
					headers: {
						'X-Auth-Token': token,
						'X-User-Id': user,
					},
				}
			);
			return data;
		} catch (error) {
			if (error.response.data.error === 'error-forwarding-chat-same-department') {
				return error.response.data;
			} else {
				throw error;
			}
		}
	},
	async transferVisitorRooms({ token, department }) {
		const getRoomsResponse = await this.getLiveChatRooms({
			visitorToken: token,
		});
		const promisesArray = [];
		for (const room of getRoomsResponse.rooms) {
			promisesArray.push(
				this.transferRoom({
					rid: room._id,
					department,
				})
			);
		}
		const closeRoomsResponse = await Promise.all(promisesArray);
		return {
			getRoomsResponse,
			closeRoomsResponse,
		};
	},
	async liveChatSend({ token, text, rid }) {
		const { data } = await axios.post(`${host}/api/v1/livechat/message`, { msg: text, token, rid });
		return data;
	},
	async getOfficeHours() {
		const { data } = await axios.get(`${host}/api/v1/livechat/office-hours`, {
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': user,
			},
		});
		return data;
	},
});
