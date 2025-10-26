
exports.handler = async (event) => {
  for (const r of event.Records) {
    const msg = JSON.parse(r.body);
    const body = JSON.parse(msg.Message);
    console.log('📧 MailWorker received:', body);
  }
  return {};
};
