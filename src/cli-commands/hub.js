/**
 * CLI command group: autoshell hub <subcommand>
 *
 * Subcommands for interacting with the AutoShell Command Hub:
 *   search  - Search templates on the Hub
 *   install - Download and install a template
 *   publish - Upload a local config as a template
 *   update  - Check and apply template updates
 *   login   - Authenticate via GitHub OAuth device flow
 *   logout  - Remove saved authentication token
 */

import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import YAML from 'yaml';
import {
  HubClient,
  createAuthenticatedClient,
  loadAuthToken,
  saveAuthToken,
  removeAuthToken,
} from '../hub/hub-client.js';
import {
  extractVariables,
  buildVariableValues,
  installTemplate,
} from '../hub/template-installer.js';
import { publishTemplate } from '../hub/template-publisher.js';
import { checkAndUpdate } from '../hub/template-updater.js';

/**
 * Register the hub command group with commander program.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerHubCommand(program) {
  const hub = program
    .command('hub')
    .description('Interact with the AutoShell Command Hub');

  registerSearchCommand(hub);
  registerInstallHubCommand(hub);
  registerPublishCommand(hub);
  registerUpdateCommand(hub);
  registerLoginCommand(hub);
  registerLogoutCommand(hub);
}

/**
 * hub search <query> - Search templates on the Hub.
 */
function registerSearchCommand(hub) {
  hub
    .command('search <query>')
    .description('Search templates on the Hub')
    .option('-c, --category <category>', 'Filter by category')
    .option('-a, --agent <agent>', 'Filter by AI agent name')
    .option('--os <os>', 'Filter by operating system')
    .action(async (query, options) => {
      try {
        const client = new HubClient();
        const results = await client.search(query, {
          category: options.category,
          agent: options.agent,
          os: options.os,
        });

        if (!Array.isArray(results) || results.length === 0) {
          console.log(chalk.yellow('No templates found.'));
          return;
        }

        console.log(chalk.bold(`Found ${results.length} template(s):\n`));
        for (const t of results) {
          console.log(chalk.cyan(`  ${t.slug || t.title}`));
          if (t.description) console.log(chalk.gray(`    ${t.description}`));
          const stats = [];
          if (t.downloads !== undefined) stats.push(`↓ ${t.downloads}`);
          if (t.stars !== undefined) stats.push(`★ ${t.stars}`);
          if (stats.length > 0) console.log(chalk.gray(`    ${stats.join('  ')}`));
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * hub install <slug> - Download and install a template.
 */
function registerInstallHubCommand(hub) {
  hub
    .command('install <slug>')
    .description('Install a template from the Hub')
    .option('--configure', 'Prompt for template variable values')
    .action(async (slug, options) => {
      try {
        const client = new HubClient();

        // Fetch template metadata and content
        const metadata = await client.getTemplate(slug);
        const content = await client.downloadTemplate(slug);

        // Handle template variables
        const varNames = extractVariables(content);
        let variables = {};

        if (varNames.length > 0 && options.configure) {
          // Dynamic import of inquirer for interactive prompting
          const { default: inquirer } = await import('inquirer');
          const schema = metadata.variables || varNames.map((n) => ({ name: n }));
          const { values, warnings } = buildVariableValues(schema, {});

          // Prompt for variables that need user input
          const questions = schema
            .filter((v) => !(v.name in values))
            .map((v) => ({
              type: 'input',
              name: v.name,
              message: `Value for "${v.name}"${v.required ? ' (required)' : ''}:`,
              default: v.default,
            }));

          if (questions.length > 0) {
            const answers = await inquirer.prompt(questions);
            variables = { ...values, ...answers };
          } else {
            variables = values;
          }

          for (const w of warnings) console.log(chalk.yellow(`  ⚠ ${w}`));
        } else if (varNames.length > 0) {
          // Use defaults only, warn about unresolved required vars
          const schema = metadata.variables || varNames.map((n) => ({ name: n }));
          const { values, warnings } = buildVariableValues(schema, {});
          variables = values;
          for (const w of warnings) console.log(chalk.yellow(`  ⚠ ${w}`));
        }

        await installTemplate({
          slug,
          content,
          variables,
          metadata: {
            version: metadata.version,
            author: metadata.author,
            tags: metadata.tags,
          },
        });
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * hub publish <file> - Publish a local config to the Hub.
 */
function registerPublishCommand(hub) {
  hub
    .command('publish <file>')
    .description('Publish a command config to the Hub')
    .option('-d, --description <desc>', 'Template description')
    .option('-c, --category <category>', 'Template category')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .action(async (file, options) => {
      try {
        const client = await createAuthenticatedClient();
        if (!client.authToken) {
          console.error(chalk.red('Error: Not authenticated. Run "autoshell hub login" first.'));
          process.exit(1);
        }

        const tags = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];

        await publishTemplate(client, file, {
          description: options.description,
          category: options.category,
          tags,
        });
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * hub update [name] - Check and apply template updates.
 */
function registerUpdateCommand(hub) {
  hub
    .command('update [name]')
    .description('Check and apply updates for installed Hub templates')
    .option('--dry-run', 'Only show available updates without applying')
    .action(async (name, options) => {
      try {
        const client = await createAuthenticatedClient();
        await checkAndUpdate(client, {
          name,
          dryRun: options.dryRun,
        });
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * hub login - Authenticate via GitHub OAuth device flow.
 */
function registerLoginCommand(hub) {
  hub
    .command('login')
    .description('Authenticate with the Hub via GitHub')
    .action(async () => {
      try {
        const existing = await loadAuthToken();
        if (existing) {
          console.log(chalk.yellow('Already logged in. Use "hub logout" first to re-authenticate.'));
          return;
        }

        const client = new HubClient();

        // Step 1: Request device code
        console.log(chalk.cyan('Requesting device authorization...'));
        const deviceResponse = await client.requestDeviceCode();

        // Step 2: Display user code and open browser
        console.log();
        console.log(chalk.bold('Open this URL in your browser:'));
        console.log(chalk.cyan(`  ${deviceResponse.verification_uri}`));
        console.log();
        console.log(chalk.bold('Enter this code:'));
        console.log(chalk.cyan(`  ${deviceResponse.user_code}`));
        console.log();

        // Step 3: Poll for token
        console.log(chalk.gray('Waiting for authorization...'));
        const interval = (deviceResponse.interval || 5) * 1000;
        const expiresAt = Date.now() + (deviceResponse.expires_in || 900) * 1000;

        while (Date.now() < expiresAt) {
          await new Promise((resolve) => setTimeout(resolve, interval));

          try {
            const tokenResponse = await client.pollForToken(deviceResponse.device_code);

            if (tokenResponse.access_token) {
              await saveAuthToken(tokenResponse.access_token);
              console.log(chalk.green('✓ Logged in successfully!'));
              return;
            }
          } catch (err) {
            // "authorization_pending" is expected while waiting
            if (!err.message.includes('authorization_pending')) {
              throw err;
            }
          }
        }

        console.error(chalk.red('Authorization timed out. Please try again.'));
        process.exit(1);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * hub logout - Remove saved authentication token.
 */
function registerLogoutCommand(hub) {
  hub
    .command('logout')
    .description('Remove saved Hub authentication')
    .action(async () => {
      try {
        await removeAuthToken();
        console.log(chalk.green('✓ Logged out. Auth token removed.'));
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}
