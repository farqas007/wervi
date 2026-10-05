import { z } from 'zod';
import { CURRENCIES } from '../constants/currency.js';

export const currencySchema = z.enum(CURRENCIES);

export const moneySchema = z
  .object({
    amount: z.number().int(),
    currency: currencySchema,
  })
  .strict();

export type Money = z.infer<typeof moneySchema>;
