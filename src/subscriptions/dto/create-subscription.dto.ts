import { IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  symbol: string;

  @IsString()
  interval: string;

  @IsNumber()
  @Min(0.1)
  @Max(100)
  takeProfit: number;
} 