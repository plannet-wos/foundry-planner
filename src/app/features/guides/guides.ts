import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AllianceService } from '../../core/services/alliance.service';
import { Alliance } from '../../core/models/alliance.model';

@Component({
  selector: 'app-guides',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './guides.html',
  styleUrl: './guides.scss'
})
export class Guides implements OnInit {
  private route           = inject(ActivatedRoute);
  private allianceService = inject(AllianceService);

  alliance: Alliance | null = null;

  async ngOnInit() {
    const allianceId = this.route.snapshot.paramMap.get('allianceId')!;
    this.alliance    = await this.allianceService.getAlliance(allianceId);
  }
}
