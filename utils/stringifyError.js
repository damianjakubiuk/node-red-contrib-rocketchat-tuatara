const safeStringify = require('./safeStringify');

function hideUnnecessaryInfo(output) {
	for (const key in output) {
		if (Object.hasOwnProperty.call(output, key)) {
			const element = output[key];
			if (typeof element === 'object') {
				if (element && element.type === 'Buffer') {
					delete element.data;
				} else if (element) {
					hideUnnecessaryInfo(element);
				}
			}
		}
	}
	return output;
}

/**
 * Format error
 * @param {Error} error
 * @returns String
 */
module.exports = function stringifyError(error) {
	const safeObject = hideUnnecessaryInfo(JSON.parse(safeStringify(error)));
	return '' + error + ': ' + safeStringify(safeObject);
};
