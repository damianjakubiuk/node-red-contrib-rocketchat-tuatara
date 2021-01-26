const api = require('./rocketchat');

module.exports = function (RED) {
	'use strict';

	function RocketChatServer(n) {
		RED.nodes.createNode(this, n);

		this.name = n.name;
		this.host = n.host;
		this.user = n.user;
		this.token = n.token;
		this.department = n.department;
		this.queueDepartment = n.queueDepartment;
	}

	RED.nodes.registerType('rocketchat-server', RocketChatServer, {
		credentials: {
			password: { type: 'password' },
		},
	});

	RED.httpAdmin.get(
		'/rocketchat-server/:id/spotlight/:search',
		RED.auth.needsPermission('rocketchat-server.read'),
		async function (req, res) {
			const { id, search } = req.params;
			const node = RED.nodes.getNode(id);
			if (node != null) {
				try {
					const { host, user, token } = node;

					const apiInstance = api({ host, user, token });

					const { users, rooms, success } = await apiInstance.spotlight(search);
					if (success) {
						return res.json({ users, rooms });
					}
					res.json([]);
				} catch (err) {
					res.sendStatus(500);
					node.error(`Rocket.Chat Server Failed: ${err.toString()}`);
				}
			} else {
				res.sendStatus(404);
			}
		}
	);
};
