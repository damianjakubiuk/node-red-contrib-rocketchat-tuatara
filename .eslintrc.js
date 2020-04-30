module.exports = {
	env: {
		commonjs: true,
		es6: true,
		node: true,
	},
	extends: ['eslint:recommended', 'eslint-config-prettier'],
	globals: {
		Atomics: 'readonly',
		SharedArrayBuffer: 'readonly',
	},
	parserOptions: {
		ecmaVersion: 2018,
	},
	plugins: ['eslint-plugin-prettier'],
	rules: {
		'prettier/prettier': 'error',
	},
};
