const api = require('./rocketchat');
const stringifyError = require('./utils/stringifyError');

module.exports = function (RED) {
	'use strict';

	function RocketChatCreate(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);

		node.on('input', async function (msg) {
			const { host, user, token } = node.server;
			const {
				liveChatTokenConfig,
				liveChatTokenConfigType,
				customFields: customFieldsConfig,
				customFieldsType,
			} = config;

			const apiInstance = api({ host, user, token });

			const liveChatToken = RED.util.evaluateNodeProperty(
				liveChatTokenConfig,
				liveChatTokenConfigType,
				this,
				msg
			);
			const customFields = RED.util.evaluateNodeProperty(customFieldsConfig, customFieldsType, this, msg);

			node.status({ fill: 'blue', shape: 'dot', text: 'rocketchat-custom-field.label.sending' });
			try {
				let success = true;
				for (const key in customFields) {
					if (customFields.hasOwnProperty(key)) {
						try {
							const { value, overwrite } = customFields[key];
							await apiInstance.setCustomField({
								token: liveChatToken,
								key,
								value,
								overwrite,
							});
							customFields[key]['success'] = true;
							customFields[key]['error'] = null;
						} catch (error) {
							success = false;
							customFields[key]['success'] = false;
							customFields[key]['error'] = {
								message: error.message,
								response: error.response
									? {
											status: error.response.status,
											statusText: error.response.statusText,
											data: error.response.data,
									  }
									: {},
							};
							node.error(stringifyError(error));
							node.status({
								fill: 'red',
								shape: 'ring',
								text: RED._('rocketchat-custom-field.errors.error-processing', error),
							});
						}
					}
				}
				node.send({
					...msg,
					payload: {
						success,
						customFields,
					},
				});
				node.status({});
			} catch (error) {
				node.send({
					...msg,
					payload: {
						success: false,
						error,
						customFields,
					},
				});
				node.error(stringifyError(error));
				node.status({
					fill: 'red',
					shape: 'ring',
					text: RED._('rocketchat-custom-field.errors.error-processing', error),
				});
			}
		});
	}

	RED.nodes.registerType('rocketchat-custom-field', RocketChatCreate);
};
