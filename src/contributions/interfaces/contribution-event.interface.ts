export interface ContributionEvent {
  eventId: string;        
  groupId: string;         
  memberId: string;        
  collectorId: string;      
  amount: number;           
  channel: 'SMS' | 'WHATSAPP' | 'WEB';
  rawPayload: string;       
  idempotencyKey: string;   // fingerprint to detect duplicates
  receivedAt: Date;
}