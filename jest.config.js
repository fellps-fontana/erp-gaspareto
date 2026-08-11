module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  // Sem isso, o Jest tambem pega o test/firestore.rules.spec.ts duplicado
  // dentro de .claude/worktrees/ (worktree e uma copia completa do repo
  // vivendo dentro da propria pasta principal) -- as duas suites rodavam
  // em paralelo contra o mesmo emulador local e uma derrubava o dado da
  // outra no meio do teste (clearFirestore concorrente), causando falhas
  // que pareciam regra quebrada mas eram so condicao de corrida.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/worktrees/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
      },
    }],
  },
};
