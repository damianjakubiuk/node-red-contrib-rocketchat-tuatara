const safeStringify = require('./safeStringify');

function hideUnnecessaryInfo(object) {
	for (const key in object) {
		if (Object.hasOwnProperty.call(object, key)) {
			const element = object[key];
			if (typeof element === 'object') {
				if (element && element.type === 'Buffer') {
					delete element.data;
				} else if (element) {
					hideUnnecessaryInfo(element);
				}
			}
		}
	}
}

/**
 * Format error
 * @param {Error} error
 * @returns String
 */
module.exports = function stringifyError(error) {
	hideUnnecessaryInfo(error);
	return '' + error + ': ' + safeStringify(error);
};
