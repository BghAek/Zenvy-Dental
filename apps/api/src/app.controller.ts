import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  // ponytail: static ok; DB/Redis pings + queue depth land with S0-4/S0-5 (06-observability)
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
