const safeStringify = require('./safeStringify');

/**
 * Format error
 * @param {Error} error
 * @returns String
 */
module.exports = function stringifyError(error) {
	return '' + error + ': ' + safeStringify(error);
};
