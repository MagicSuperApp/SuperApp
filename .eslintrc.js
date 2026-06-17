module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // YC-1: chống regression hardcode màu. Mọi màu phải đi qua design token
    // (theme/tokens.ts) — tuân INTEGRATION-STANDARD §2.1 "CẤM hardcode màu".
    // Để 'warn' (KHÔNG fail toàn repo) vì code lịch sử còn vài chỗ; nâng 'error'
    // sau khi quét sạch. Bắt cả hex literal (#rgb/#rrggbb/#rrggbbaa).
    'no-restricted-syntax': [
      'warn',
      {
        selector:
          "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
        message:
          'Cấm hardcode màu hex. Dùng design token qua useTheme()/getToken() (src/theme).',
      },
    ],
  },
  overrides: [
    {
      // Nguồn token được phép chứa hex thô (đây là nơi định nghĩa giá trị).
      files: [
        'src/theme/tokens.ts',
        'src/theme/theme.config.ts',
        'src/theme/index.ts',
      ],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
