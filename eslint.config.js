import { defineConfig } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const nondeterministicSourcesAllowedIn = ['src/state/feed.ts', 'src/state/hud.ts', 'tests/**']

const memoisationSyntax = {
  selector: "MemberExpression[object.name='React'][property.name=/^(memo|useMemo|useCallback)$/]",
  message: 'The React Compiler memoises; manual memoisation is banned.',
}

const styleAttributeSyntax = {
  selector: "JSXAttribute[name.name='style']",
  message: 'No style props: the CSP forbids inline styles. Use CSS Modules, data attributes or CSSOM custom properties.',
}

const fixedTodayMessage = 'The world has a fixed today; import TODAY from src/domain/world.ts.'
const seededRandomMessage = 'Use the seeded PRNG from src/domain/prng.ts.'

const nondeterministicSyntax = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: fixedTodayMessage },
  { selector: "NewExpression[callee.property.name='Date'][arguments.length=0]", message: fixedTodayMessage },
  { selector: "CallExpression[callee.name='Date']", message: fixedTodayMessage },
  { selector: "CallExpression[callee.property.name='Date']", message: fixedTodayMessage },
  { selector: "MemberExpression[property.name='now'][object.property.name='Date']", message: fixedTodayMessage },
  { selector: "MemberExpression[property.value='now'][object.name='Date']", message: fixedTodayMessage },
  { selector: "MemberExpression[property.value='now'][object.property.name='Date']", message: fixedTodayMessage },
  { selector: "MemberExpression[property.name='random'][object.property.name='Math']", message: seededRandomMessage },
  { selector: "MemberExpression[property.value='random'][object.name='Math']", message: seededRandomMessage },
  { selector: "MemberExpression[property.value='random'][object.property.name='Math']", message: seededRandomMessage },
]

const nondeterministicProperties = [
  { object: 'Math', property: 'random', message: seededRandomMessage },
  { object: 'Date', property: 'now', message: fixedTodayMessage },
]

export default defineConfig(
  {
    ignores: [
      '.claude/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'output/**',
    ],
  },
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/unit/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'react',
            importNames: ['memo', 'useMemo', 'useCallback'],
            message: 'The React Compiler memoises; manual memoisation is banned.',
          },
          {
            name: 'react',
            importNames: ['default'],
            message: 'Use named imports from react.',
          },
        ],
      }],
      'no-restricted-properties': ['error', ...nondeterministicProperties],
      'no-restricted-syntax': ['error', memoisationSyntax, styleAttributeSyntax, ...nondeterministicSyntax],
    },
  },
  {
    files: ['**/*.tsx'],
    extends: [jsxA11y.flatConfigs.strict],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
      'jsx-a11y/no-interactive-element-to-noninteractive-role': ['error', { canvas: ['img'] }],
    },
  },
  {
    files: ['src/ui/charts/CashFlowChart.tsx'],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region', 'group'] }],
      'jsx-a11y/no-noninteractive-element-interactions': ['error', {
        body: ['onError', 'onLoad'],
        iframe: ['onError', 'onLoad'],
        img: ['onError', 'onLoad'],
        div: ['onKeyDown', 'onFocus', 'onBlur', 'onPointerMove', 'onPointerLeave'],
      }],
    },
  },
  {
    files: nondeterministicSourcesAllowedIn,
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': ['error', memoisationSyntax, styleAttributeSyntax],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
