// Ett tillägg i ElevenLabs TwiML på Twilio-vägen (app/api/twilio/incoming-call).
//
// När agenten lägger på (end_call) stänger ElevenLabs strömmen, och Twilio går
// vidare till nästa verb efter <Connect>. Finns inget lägger Twilio på samma
// sekund. En sekunds tystnad efter strömmen ger farvälet tid att klinga ut
// innan linjen bryts. Fri från imports, så den kan testas med vanliga node.

/** En sekunds paus sist i TwiML som har en <Connect>. Allt annat kommer tillbaka oförändrat. */
export function withPauseAfterStream(twiml: string): string {
  if (!/<Connect>[\s\S]*<\/Connect>/.test(twiml) || !/<\/Response>\s*$/.test(twiml)) return twiml
  return twiml.replace(/<\/Response>\s*$/, '<Pause length="1"/></Response>')
}
