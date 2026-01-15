#!/usr/bin/env node
/**
 * Email Queue Sender
 *
 * Processes pending emails from the queue with rate limiting
 *
 * Usage:
 *   node run-email-sender.js          # Process queue once
 *   node run-email-sender.js --watch  # Continuously monitor and process queue
 */

import { initSchema } from './src/database/db.js';
import { EmailService } from './src/services/EmailService.js';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           Email Queue Sender - Outreach System            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Initialize database
initSchema();

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch') || args.includes('-w');

  if (watchMode) {
    console.log('🔄 Watch mode enabled - will continuously monitor queue\n');
    await watchModeProcess();
  } else {
    await oneTimeProcess();
  }
}

async function oneTimeProcess() {
  try {
    const result = await EmailService.processQueue();

    console.log('✅ Email queue processing complete!\n');

    if (result.limitReached) {
      console.log('⏸ Daily limit reached. Queue will resume tomorrow.');
      process.exit(0);
    }

    if (result.processed === 0) {
      console.log('ℹ No emails to send. Queue is empty.');
      process.exit(0);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error processing queue:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function watchModeProcess() {
  const CHECK_INTERVAL = 60000; // Check every minute
  let consecutiveEmptyChecks = 0;
  const MAX_EMPTY_CHECKS = 10; // Stop after 10 consecutive empty checks

  console.log(`⏰ Checking queue every ${CHECK_INTERVAL / 1000} seconds...\n`);
  console.log('Press Ctrl+C to stop\n');

  const processQueue = async () => {
    try {
      const stats = EmailService.getQueueStats();

      if (stats.pending === 0) {
        consecutiveEmptyChecks++;
        console.log(`[${new Date().toLocaleTimeString()}] No pending emails (${consecutiveEmptyChecks}/${MAX_EMPTY_CHECKS})`);

        if (consecutiveEmptyChecks >= MAX_EMPTY_CHECKS) {
          console.log('\n✅ No emails to process for extended period. Exiting watch mode.');
          process.exit(0);
        }
        return;
      }

      consecutiveEmptyChecks = 0;
      console.log(`\n[${new Date().toLocaleTimeString()}] 📬 Queue status: ${stats.pending} pending, ${stats.sending} sending, ${stats.sentToday} sent today`);

      const result = await EmailService.processQueue();

      if (result.limitReached) {
        console.log('\n⏸ Daily limit reached. Pausing until tomorrow...\n');
        console.log('Watch mode will continue monitoring.');
        console.log('Queue will automatically resume when the new day starts.\n');
        return;
      }

      if (result.processed > 0) {
        console.log(`✅ Batch complete: ${result.sent} sent, ${result.failed} failed\n`);
      }
    } catch (error) {
      console.error(`\n❌ Error in watch mode: ${error.message}\n`);
    }
  };

  // Process immediately on start
  await processQueue();

  // Set up interval
  const interval = setInterval(processQueue, CHECK_INTERVAL);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Received interrupt signal. Shutting down gracefully...\n');
    clearInterval(interval);
    console.log('✅ Email sender stopped.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Received termination signal. Shutting down gracefully...\n');
    clearInterval(interval);
    console.log('✅ Email sender stopped.');
    process.exit(0);
  });
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
