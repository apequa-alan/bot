# Trading Bot Architecture

## Overview
The system is a trading bot that generates and manages trading signals based on MACD indicators and volume analysis. It integrates with Bybit for market data and Telegram for user notifications.

## Core Components

### Trading Bot Module
- **TradingBotService**: Main service that handles market data processing and signal generation
  - Monitors top volume coins
  - Processes WebSocket data from Bybit
  - Generates signals based on MACD and volume analysis
  - Manages signal lifecycle

### Signals Module
- **SignalsService**: Manages signal lifecycle and updates
  - Creates new signals
  - Updates signal status
  - Tracks active signals
  - Manages signal statistics

- **SignalsDatabaseService**: Handles signal persistence
  - Saves signals to database
  - Updates signal status
  - Retrieves active signals
  - Manages signal cleanup

- **SignalMetricsService**: Handles signal performance metrics
  - Calculates success rates
  - Tracks profit/loss statistics
  - Generates performance reports

### Telegram Module
- **TelegramService**: Core Telegram integration
  - Sends notifications
  - Handles user interactions
  - Manages message formatting

- **SignalBroadcastService**: Handles signal broadcasting
  - Broadcasts signals to channels
  - Sends personalized signals to subscribers
  - Formats signal messages

- **SignalUpdateService**: Manages signal updates
  - Broadcasts signal status changes
  - Sends profit/loss notifications
  - Formats update messages

### Subscriptions Module
- **SubscriptionsService**: Manages user subscriptions
  - Handles user subscriptions to symbols
  - Manages custom take profit levels
  - Finds matching subscriptions for signals

## Data Flow

1. **Signal Generation**
   - TradingBotService receives market data via WebSocket
   - Analyzes MACD and volume indicators
   - Generates signals when conditions are met
   - Creates Signal entity with entry details

2. **Signal Broadcasting**
   - Signal is saved to database
   - Subscribers are found for the symbol/interval
   - Personalized messages are sent to each subscriber
   - Channel broadcast is sent if configured

3. **Signal Updates**
   - Price updates are monitored
   - Profit/loss is calculated
   - Status updates are broadcast to subscribers
   - Signal metrics are updated

## Database Schema

### Signal Entity
- id: string (UUID)
- symbol: string
- interval: string
- type: 'long' | 'short'
- entryPrice: number
- exitPrice?: number
- takeProfit?: number
- stopLoss?: number
- status: 'active' | 'success' | 'failure'
- profit?: number
- timestamp: number
- exitTimestamp?: number
- profitLoss: number | null
- entryTime: string
- active: boolean
- maxProfit: number
- notified: boolean
- messageId?: number
- validityHours: number

### Subscription Entity
- id: string (UUID)
- userId: string
- symbol: string
- interval: string
- takeProfit: number
- active: boolean

## Configuration

### Environment Configuration

The application uses a flexible environment configuration system:

- `.env.development.local` - Local development settings (not committed to git)
- `.env.development` - Default development settings
- `.env.production` - Production settings
- `.env.test` - Test settings

The system will:

1. First try to load the `.local` variant of the environment file
2. Fall back to the regular environment file if `.local` doesn't exist
3. Use `NODE_ENV` to determine which environment to load

### Timeframe Configuration
```typescript
{
  '1': { profit: 0.6, validityHours: 1 },
  '3': { profit: 0.8, validityHours: 1 },
  '5': { profit: 1, validityHours: 1 },
  '15': { profit: 1, validityHours: 2.5 },
  '30': { profit: 1.5, validityHours: 2.5 },
  '60': { profit: 2, validityHours: 4 },
  '120': { profit: 3, validityHours: 8 },
  '240': { profit: 3.5, validityHours: 16 },
  '360': { profit: 4, validityHours: 32 },
  'D': { profit: 5, validityHours: 96 },
  'W': { profit: 8, validityHours: 168 },
  'M': { profit: 10, validityHours: 720 }
}
```

## Message Formatting

### Telegram Messages

- HTML formatting is supported for messages
- Links are rendered as clickable elements
- Message options include:
    - `parse_mode: 'HTML'` for HTML formatting
    - Custom keyboards for user interaction
    - Inline keyboards for dynamic actions

### Message Types

1. Welcome Messages
    - HTML-formatted text
    - Clickable links
    - Main keyboard for navigation

2. Signal Messages
    - Formatted trading signals
    - Entry/exit information
    - Profit/loss calculations

3. Error Messages
    - Error notifications
    - Stack traces for debugging
    - User-friendly error descriptions

## Dependencies
- NestJS: Framework
- TypeORM: Database ORM
- PostgreSQL: Database
- Bybit API: Market data
- Telegram Bot API: User notifications
- WebSocket: Real-time data streaming

## Error Handling
- WebSocket connection errors
- Signal generation failures
- Message sending failures
- Database operation errors

## Monitoring
- Daily signal statistics
- Success rate tracking
- Profit/loss metrics
- Active signal monitoring

## Technical Stack

### Backend Framework
- NestJS - A progressive Node.js framework
- TypeScript - For type-safe development

### Database

- PostgreSQL - For storing trading signals and related data
    - Uses TypeORM for database operations
    - SSL connection enabled
    - Migrations for schema management
    - Environment-based configuration via DATABASE_URL

### External Services
- Bybit API - For trading operations
- Telegram Bot API - For notifications and commands

### Configuration
Environment variables (`.env`):
- Trading Parameters:
  - FAST_PERIOD
  - SLOW_PERIOD
  - SIGNAL_PERIOD
  - VOLUME_SMA_SMOOTHING_PERIOD
  - INTERVAL
- API Credentials:
  - BYBIT_API_KEY
  - BYBIT_API_SECRET
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_CHANNEL_ID

## Project Structure
```
├── src/
│   ├── trading-bot/     # Trading strategy and execution
│   ├── signals/         # Signal processing and management
│   ├── bybit/          # Bybit API integration
│   ├── telegram/       # Telegram bot integration
│   ├── utils/          # Shared utilities
│   ├── app.module.ts   # Root module
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── main.ts         # Application entry point
├── db/                 # Database files
├── dist/              # Compiled output
└── configuration files
    ├── .env           # Environment variables
    ├── tsconfig.json  # TypeScript configuration
    └── package.json   # Dependencies and scripts
```

## Development Guidelines

### Code Organization
- Each module is self-contained with its own controllers, services, and DTOs
- Shared functionality is placed in the utils module
- Clear separation between business logic and external service integration

### Best Practices
- TypeScript strict mode enabled
- Modular architecture following NestJS conventions
- Environment-based configuration
- Error handling and logging
- Database migrations and versioning

### Testing
- Unit tests for individual components
- Integration tests for module interactions
- End-to-end tests for critical flows

## Deployment
The application can be deployed as a Node.js service, with the following considerations:
- Environment variables must be properly configured
- Database migrations should be run
- Proper error handling and monitoring should be in place
- Regular backups of the database should be maintained 