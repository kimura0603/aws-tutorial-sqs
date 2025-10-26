
exports.handler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body);
    console.log('Processing:', job.id, job);
    if (job.shouldFail) {
      console.error('Simulated failure for', job.id);
      throw new Error('Simulated failure'); // 再試行→DLQへ
    }
    await new Promise(r => setTimeout(r, 1000));
    console.log('✅ Success:', job.id);
  }
  return {};
};
