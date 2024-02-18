from typing import NamedTuple

import pymunk  # type: ignore

TORSO_SIZE = (164, 254)
LEG_SIZE = (60, 275)

# how many pixels from each edge
# are the torso & leg anchors?
LEG_JOINT_OFFSET = 30


class Fighter(NamedTuple):
    torso: pymunk.Body
    torso_box: pymunk.Poly

    # right leg
    rleg: pymunk.Body
    rleg_box: pymunk.Poly
    rleg_motor: pymunk.SimpleMotor

    # left leg
    lleg: pymunk.Body
    lleg_box: pymunk.Poly
    lleg_motor: pymunk.SimpleMotor

    def position_json(self) -> dict[str, dict[str, float]]:
        """
        Encode position in json for sending to client.
        """
        torso_x, torso_y = self.torso.position
        rleg_x, rleg_y = self.rleg.position
        lleg_x, lleg_y = self.lleg.position

        return {
            "torso": {"x": torso_x, "y": torso_y, "angle": self.torso.angle},
            "rleg": {"x": rleg_x, "y": rleg_y, "angle": self.rleg.angle},
            "lleg": {"x": lleg_x, "y": lleg_y, "angle": self.lleg.angle},
        }


def add_fighter(
    space: pymunk.Space, group: int, starting_position: tuple[int, int]
) -> Fighter:
    torso = pymunk.Body(mass=10, moment=1000)
    torso.position = starting_position
    torso.angle = 0

    rleg = pymunk.Body(mass=10, moment=500)
    rleg.position = starting_position
    rleg.angle = 0

    lleg = pymunk.Body(mass=10, moment=500)
    lleg.position = starting_position
    lleg.angle = 0

    torso_box = pymunk.Poly.create_box(torso, size=TORSO_SIZE)
    torso_box.group = group
    torso_box.elasticity = 0.5

    rleg_box = pymunk.Poly.create_box(rleg, size=LEG_SIZE)
    rleg_box.group = group
    rleg_box.elasticity = 0.5

    lleg_box = pymunk.Poly.create_box(lleg, size=LEG_SIZE)
    lleg_box.group = group
    lleg_box.elasticity = 0.5

    torso_box.filter = pymunk.ShapeFilter(group=group)
    rleg_box.filter = pymunk.ShapeFilter(group=group)
    lleg_box.filter = pymunk.ShapeFilter(group=group)

    rtorso_anchor = (
        TORSO_SIZE[0] / 2 - LEG_JOINT_OFFSET,
        TORSO_SIZE[1] / 2 - LEG_JOINT_OFFSET,
    )
    ltorso_anchor = (
        LEG_JOINT_OFFSET - TORSO_SIZE[0] / 2,
        TORSO_SIZE[1] / 2 - LEG_JOINT_OFFSET,
    )
    rleg_anchor = LEG_JOINT_OFFSET - LEG_SIZE[0] / 2, LEG_JOINT_OFFSET - LEG_SIZE[1] / 2
    lleg_anchor = LEG_SIZE[0] / 2 - LEG_JOINT_OFFSET, LEG_JOINT_OFFSET - LEG_SIZE[1] / 2
    rjoint = pymunk.PivotJoint(torso, rleg, rtorso_anchor, rleg_anchor)
    ljoint = pymunk.PivotJoint(torso, lleg, ltorso_anchor, lleg_anchor)

    rleg_motor = pymunk.SimpleMotor(torso, rleg, rate=0)
    lleg_motor = pymunk.SimpleMotor(torso, lleg, rate=0)

    space.add(
        torso,
        torso_box,
        rleg,
        rleg_box,
        rleg_motor,
        lleg,
        lleg_box,
        lleg_motor,
        rjoint,
        ljoint,
    )
    return Fighter(
        torso,
        torso_box,
        rleg,
        rleg_box,
        rleg_motor,
        lleg,
        lleg_box,
        lleg_motor,
    )
