import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  automaticPaymentChannelLabel,
  automaticPaymentProviderLabel,
  buildBillingPanelState,
  buildInteractiveQrisPaymentInstruction,
  buildMidtransReturnMessage,
  findNewlyCreditedAutomaticPayment,
  hasPendingAutomaticPayments,
  isAutomaticPaymentRefreshable,
  parseMidtransReturnParams,
  resolveInteractiveQrisClosedState,
  stripMidtransReturnParams
} from './billingPanelState.js';

test('billing panel state keeps Midtrans, QRIS, and Shopee sections available', () => {
  const state = buildBillingPanelState(
    {
      settings: {
        shopee_payment: {
          url: 'https://shopee.example/item',
          note: 'Shopee aktif',
          contact: 'Admin'
        },
        interactive_qris_payment: {
          merchantName: 'Merchant Test',
          qrImageUrl: 'https://cdn.example/qris.png',
          instructions: 'Bayar sesuai nominal unik.',
          contact: 'WA Admin',
          closedHours: {
            enabled: true,
            timezone: 'Asia/Jakarta',
            start: '22:00',
            end: '05:00',
            message: 'QRIS tutup malam.'
          }
        }
      },
      features: {
        midtransAvailable: true,
        midtransIsProduction: false,
        midtransMinimumAmountIdr: 2000,
        interactiveQrisAvailable: true,
        interactiveQrisMinimumAmountIdr: 2000,
        interactiveQrisUniqueDigits: 3
      }
    },
    {
      user: {
        email: 'user@example.com'
      }
    }
  );

  assert.equal(state.sessionEmail, 'user@example.com');
  assert.equal(state.shopee.url, 'https://shopee.example/item');
  assert.equal(state.midtrans.available, true);
  assert.equal(state.midtrans.minimumAmountIdr, 2000);
  assert.equal(state.interactiveQris.available, true);
  assert.equal(state.interactiveQris.qrImageUrl, 'https://cdn.example/qris.png');
  assert.equal(state.interactiveQris.closedHours.start, '22:00');
  assert.equal(state.interactiveQris.closedHours.message, 'QRIS tutup malam.');
});

test('midtrans return parser reads order id and normalizes pending status', () => {
  const parsed = parseMidtransReturnParams('?view=billing&midtrans_return=1&midtrans_order_id=mt-123&transaction_status=pending');
  assert.equal(parsed.isReturn, true);
  assert.equal(parsed.orderId, 'mt-123');
  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.view, 'billing');
});

test('midtrans return params can be stripped from the url query', () => {
  assert.equal(
    stripMidtransReturnParams('?view=billing&midtrans_return=1&midtrans_order_id=mt-123&transaction_status=settlement'),
    '?view=billing'
  );
});

test('midtrans return message prioritizes credited payments', () => {
  assert.equal(
    buildMidtransReturnMessage('success', { status: 'settlement', credited_ledger_id: 'ledger-1' }),
    'Pembayaran sudah terverifikasi dan credit masuk ke saldo Anda.'
  );
});

test('interactive qris instruction renders active pending payment details', () => {
  const instruction = buildInteractiveQrisPaymentInstruction(
    {
      provider: 'interactive_qris',
      status: 'pending',
      amount_idr: 10237,
      base_amount_idr: 10000,
      unique_code: 237,
      expired_at: '2099-07-11T10:30:00.000Z'
    },
    {
      uniqueDigits: 3,
      merchantName: 'Merchant QRIS',
      qrImageUrl: 'https://cdn.example/qris.png',
      instructions: 'Bayar sesuai nominal unik.'
    },
    new Date('2099-07-11T10:00:00.000Z').getTime()
  );

  assert.equal(instruction.displayAmountIdr, 10237);
  assert.equal(instruction.baseAmountIdr, 10000);
  assert.equal(instruction.uniqueCode, '237');
  assert.equal(instruction.merchantName, 'Merchant QRIS');
});

test('automatic payment helpers keep QRIS non-refreshable and label mixed providers', () => {
  assert.equal(isAutomaticPaymentRefreshable({ provider: 'midtrans', status: 'pending' }), true);
  assert.equal(isAutomaticPaymentRefreshable({ provider: 'interactive_qris', status: 'pending' }), false);
  assert.equal(automaticPaymentProviderLabel('interactive_qris'), 'QRIS otomatis');
  assert.equal(automaticPaymentProviderLabel('midtrans'), 'Pembayaran online');
  assert.equal(automaticPaymentChannelLabel({ provider: 'interactive_qris', payment_type: 'qris_static_unique' }), 'QRIS statis');
});

test('pending automatic payment helper keeps polling for active rows only', () => {
  assert.equal(
    hasPendingAutomaticPayments(
      [
        {
          id: 'qris-1',
          provider: 'interactive_qris',
          status: 'pending',
          expired_at: '2099-07-11T10:30:00.000Z'
        }
      ],
      new Date('2099-07-11T10:00:00.000Z').getTime()
    ),
    true
  );

  assert.equal(
    hasPendingAutomaticPayments(
      [
        {
          id: 'qris-2',
          provider: 'interactive_qris',
          status: 'pending',
          expired_at: '2099-07-11T09:30:00.000Z'
        }
      ],
      new Date('2099-07-11T10:00:00.000Z').getTime()
    ),
    false
  );
});

test('newly credited automatic payment helper detects success transition', () => {
  const creditedPayment = findNewlyCreditedAutomaticPayment(
    [
      {
        id: 'payment-1',
        provider: 'interactive_qris',
        status: 'pending',
        credited_ledger_id: null
      }
    ],
    [
      {
        id: 'payment-1',
        provider: 'interactive_qris',
        status: 'settlement',
        credited_ledger_id: 'ledger-123'
      }
    ]
  );

  assert.equal(creditedPayment?.id, 'payment-1');
  assert.equal(creditedPayment?.credited_ledger_id, 'ledger-123');
});

test('interactive qris closed hours helper follows Asia Jakarta overnight window', () => {
  const closedState = resolveInteractiveQrisClosedState(
    {
      closedHours: {
        enabled: true,
        timezone: 'Asia/Jakarta',
        start: '22:00',
        end: '05:00',
        message: 'QRIS tutup malam.'
      }
    },
    new Date('2026-07-11T15:30:00.000Z').getTime()
  );

  const openState = resolveInteractiveQrisClosedState(
    {
      closedHours: {
        enabled: true,
        timezone: 'Asia/Jakarta',
        start: '22:00',
        end: '05:00',
        message: 'QRIS tutup malam.'
      }
    },
    new Date('2026-07-11T03:00:00.000Z').getTime()
  );

  assert.equal(closedState.isClosed, true);
  assert.equal(openState.isClosed, false);
});
