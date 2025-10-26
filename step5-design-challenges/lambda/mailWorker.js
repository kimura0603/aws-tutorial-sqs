
exports.handler = async (event) => {
  for (const r of event.Records) {
    const msg = JSON.parse(r.body);
    const order = JSON.parse(msg.Message);
    console.log('📧 Send mail for order:', order.id);
    if (order.shouldFailMail) {
      console.error('Simulated mail failure for', order.id);
      throw new Error('Mail failure');
    }
  }
  return {};
};
