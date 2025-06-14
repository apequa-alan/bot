import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Transaction } from './entities/transaction.entity';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { TransactionsRepository } from './transactions.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User, Transaction]), ConfigModule],
  providers: [UsersService, UsersRepository, TransactionsRepository],
  exports: [UsersService],
})
export class UsersModule {}
