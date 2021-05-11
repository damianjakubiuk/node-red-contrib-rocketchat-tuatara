/**
 * Safely stringify object into a JSON without crashing on circular structure
 * @param {Any} obj
 * @returns String
 */
module.exports = function safeStringify(obj) {
	let cache = [];
	const retVal = JSON.stringify(obj, (key, value) => {
		if (key !== '_sessionCache') {
			if (typeof value === 'object' && value !== null) {
				if (cache.includes(value)) {
					return undefined;
				} else {
					cache.push(value);
					return value;
				}
			} else {
				return value;
			}
		}
	});
	cache = null;
	return retVal;
};
