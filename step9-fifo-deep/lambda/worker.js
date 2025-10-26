
exports.handler = async (event) => {
  for (const r of event.Records) {
    const job = JSON.parse(r.body);
    console.log('Processing (FIFO):', job);
  }
  return {};
};
