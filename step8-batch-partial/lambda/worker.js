
exports.handler = async (event) => {
  const failures = [];
  for (const r of event.Records) {
    try {
      const msg = JSON.parse(r.body);
      if (msg.shouldFail) throw new Error('Intentional failure ' + msg.id);
      console.log('✅ OK:', msg.id);
    } catch (e) {
      console.error('❌ FAIL:', r.messageId, e.message);
      failures.push({ itemIdentifier: r.messageId });
    }
  }
  return { batchItemFailures: failures };
};
