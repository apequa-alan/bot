import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
  ) {}

  async create(transaction: Partial<Transaction>): Promise<Transaction> {
    const newTransaction = this.repository.create(transaction);
    return this.repository.save(newTransaction);
  }
}
