--> 011 hand-authored reconciliation (runs BEFORE the drop so no pin exists only in the legacy store):
--> copy any beit_chabad_pin not already present as a place (010 copied the then-existing pins with the
--> same provenance; this WHERE NOT EXISTS self-heals any pin added after 010 and is a no-op otherwise).
INSERT INTO `place` (`id`,`layer_id`,`name`,`lat`,`lng`,`address`,`phone`,`source`,`source_id`,`license`,`created_at`,`updated_at`)
  SELECT 'place_'||`id`,'layer_chabad_houses',`name`,`lat`,`lng`,`address`,`phone`,'beit_chabad_seed',`id`,'internal',`created_at`,`updated_at`
  FROM `beit_chabad_pin` p
  WHERE NOT EXISTS (SELECT 1 FROM `place` x WHERE x.`source`='beit_chabad_seed' AND x.`source_id`=p.`id`);--> statement-breakpoint
DROP TABLE `beit_chabad_pin`;
