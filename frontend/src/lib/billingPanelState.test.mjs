import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBillingPanelState, buildMidtransReturnMessage, parseMidtransReturnParams, stripMidtransReturnParams } from './billingPanelState.js';

test('billing panel state keeps both Midtrans and Shopee sections available', () => {
  const state = buildBillingPanelState(
    {
      settings: {
        shopee_payment: {
          url: 'https://shopee.example/item',
          note: 'Shopee aktif',
          contact: 'Admin'
        }
      },
      features: {
        midtransAvailable: true,
        midtransIsProduction: false,
        midtransMinimumAmountIdr: 2000
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
    'Pembayaran Midtrans sudah terverifikasi dan credit masuk ke saldo Anda.'
  );
});
