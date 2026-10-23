import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, {
 files: ['src/office/**/*.{ts,tsx}', 'apps/office-api/src/**/*.ts', 'tests/office/**/*.ts'],
 rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
});
