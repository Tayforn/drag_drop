import {EventData} from './event.model';

export interface EventRect {
  id: string; // To link back to the event
  left: number;
  top: number;
  width: number;
  height: number;
  originalEvent: EventData; // Keep a reference to the original event data
}
