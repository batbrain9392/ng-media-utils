import { TestBed } from '@angular/core/testing';

import { BackgroundEffectsService } from './background-effects.service';

describe('BackgroundEffectsService', () => {
  let service: BackgroundEffectsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BackgroundEffectsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
