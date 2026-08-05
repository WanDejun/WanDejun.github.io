import type { Command } from '../types';
import { error } from './utils';

export const themeCommand: Command = {
  name: 'theme',
  description: 'List or switch color themes',
  usage: 'theme [NAME]',
  completion: 'themes',
  execute(args, _stdin, context) {
    if (!context.isStandalone) {
      return { stdout: '', stderr: error('theme', 'cannot be used in a pipeline'), exitCode: 2 };
    }
    if (args.length > 1) {
      return { stdout: '', stderr: error('theme', 'expected at most one theme name'), exitCode: 2 };
    }

    const names = context.themeNames();
    if (args.length === 0) {
      return {
        stdout: `${names.map((name) => `${name === context.themeName ? '* ' : '  '}${name}`).join('\n')}\n`,
      };
    }

    const [name] = args;
    if (!names.includes(name)) {
      return { stdout: '', stderr: error('theme', `unknown theme '${name}'`), exitCode: 1 };
    }
    return { stdout: '', chunks: [{ type: 'theme', name }] };
  },
};
