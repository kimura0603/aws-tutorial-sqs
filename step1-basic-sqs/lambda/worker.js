
exports.handler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body);
    console.log('Processing job:', job);
    await new Promise(r => setTimeout(r, 1000));
    console.log('✅ Done:', job.id);
  }
  return {};
};
