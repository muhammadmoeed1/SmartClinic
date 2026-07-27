import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto, JoinWaitlistDto, ListAppointmentsQueryDto,
  SlotsQueryDto, UpdateAppointmentDto,
} from './dto';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointments: AppointmentsService) {}

  @Get('slots')
  @ApiOperation({ summary: '30-min slot availability for a doctor on a date' })
  slots(@Query() query: SlotsQueryDto) {
    return this.appointments.getSlots(query.doctorId, query.date);
  }

  @Post()
  @Roles(Role.PATIENT, Role.RECEPTIONIST, Role.ADMIN)
  @ApiOperation({ summary: 'Book an appointment (conflict-safe)' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(user, dto);
  }

  @Post('waitlist')
  @Roles(Role.PATIENT, Role.RECEPTIONIST)
  @ApiOperation({ summary: 'Join the waitlist for a doctor/date' })
  joinWaitlist(@CurrentUser() user: JwtUser, @Body() dto: JoinWaitlistDto) {
    return this.appointments.joinWaitlist(user, dto);
  }

  @Get('waitlist')
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @ApiOperation({ summary: 'List active waitlist entries (optionally by doctor/date)' })
  listWaitlist(@Query('doctorId') doctorId?: string, @Query('date') date?: string) {
    return this.appointments.listWaitlist(doctorId, date);
  }

  @Post('waitlist/:id/notify')
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @ApiOperation({ summary: 'Manually notify a waitlisted patient' })
  notifyWaitlistEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.notifyWaitlistEntry(id);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments (role-scoped)' })
  list(@CurrentUser() user: JwtUser, @Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one appointment' })
  getOne(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.getOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Reschedule or change status (role-guarded transitions)' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(user, id, dto);
  }
}
